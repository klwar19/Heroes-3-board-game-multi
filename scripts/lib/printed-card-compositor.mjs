// Shared compositing helpers for printed-style hero-specialty cards and hero
// boards built over REAL game scans. Extracted verbatim from
// scripts/build-ignatius-olema-art.mjs (which keeps its own copy, untouched)
// so scripts/build-specialty-card-faces.mjs can reuse the same proven text,
// glyph, leather-plate, consensus frame-mask and keyed cut-out code.
// `leatherPlate` gained one knob: PLATE_EXCLUDE (hero slugs whose cards are
// generated, so they are never stacked into another card's leather plate).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const A = "public/assets";
const GLYPHS = "scripts/card-glyphs";
const FONT = "Times New Roman";
const DEBUG = process.env.ART_DEBUG_DIR || "";

const COL = {
  title: "#e3d59f", body: "#eee3d4", subtitle: "#dccd8e", digit: "#f0e8da",
  boardName: "#e8cc92", boardLabel: "#dfca86", boardSpec: "#ece4dc", glyph: "#e9c76c", glyphHp: "#e6c865",
};

const read = (f) => readFileSync(f);
const png = (img) => img.png().toBuffer();
async function raw(input, extract) {
  let img = sharp(input);
  if (extract) img = img.extract(extract);
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}
const fromRaw = (data, w, h, channels = 4) => sharp(data, { raw: { width: w, height: h, channels } });

// ─── text ────────────────────────────────────────────────────────────────────
const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function textSvg(text, { size, fill, weight = "bold", sx = 1, shadow = 0.75, font = FONT }) {
  const pad = Math.ceil(size * 0.5);
  const w = Math.ceil(size * text.length * 0.8 * sx + 2 * pad);
  const h = Math.ceil(size * 1.6);
  const base = Math.round(size * 1.15);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<defs><filter id="s" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="${(size / 26).toFixed(2)}" stdDeviation="${(size / 30).toFixed(2)}" flood-color="#000" flood-opacity="${shadow}"/></filter></defs>` +
      `<g transform="translate(${pad},${base}) scale(${sx},1)"><text x="0" y="0" font-family="${font}" font-weight="${weight}" font-size="${size}" fill="${fill}" xml:space="preserve" filter="url(#s)">${esc(text)}</text></g></svg>`,
  );
}
const widthCache = new Map();
/** Ink width (px) and left bearing of a text run. */
async function measure(text, o) {
  const key = `${o.size}|${o.weight}|${o.sx}|${o.font}|${text}`;
  if (widthCache.has(key)) return widthCache.get(key);
  const svg = textSvg(text, { ...o, fill: "#fff", shadow: 0 });
  const { info } = await sharp(svg).trim({ threshold: 10 }).toBuffer({ resolveWithObject: true });
  const r = { width: info.width, left: -info.trimOffsetLeft, pad: Math.ceil(o.size * 0.5) };
  widthCache.set(key, r);
  return r;
}
/** Text op whose INK is horizontally centred on cx with its baseline at y. */
async function textAt(text, o, cx, baseline, align = "center") {
  const m = await measure(text, o);
  const input = textSvg(text, o);
  const inkLeft = align === "center" ? cx - m.width / 2 : cx;
  return { input, left: Math.round(inkLeft - m.left), top: Math.round(baseline - Math.round(o.size * 1.15)) };
}

async function glyph(name, height, color) {
  let svg = readFileSync(`${GLYPHS}/${name}.svg`, "utf8");
  svg = svg.replace(/<svg\b/, `<svg color="${color}"`);
  const buf = await sharp(Buffer.from(svg), { density: 300 }).resize({ height }).png().toBuffer();
  const meta = await sharp(buf).metadata();
  return { buf, width: meta.width, height: meta.height };
}
const GLYPH_COLOR = { health_points: COL.glyphHp, unit_passive: "#e6c860", spell: "#e6c860" };

/**
 * Word-wrap tokens ("{glyph}" inserts a card glyph) into centred lines.
 * `first` = baseline of line 1, or `centerY` = vertical centre of the block.
 */
async function layoutText(tokens, { x, width, first, centerY, lineH, o }) {
  const words = [];
  for (const t of tokens) {
    if (/^\{[a-z_]+\}$/.test(t)) words.push({ glyph: t.slice(1, -1) });
    else for (const w of t.split(/\s+/).filter(Boolean)) words.push({ text: w });
  }
  const space = (await measure("n n", o)).width - (await measure("nn", o)).width;
  const gh = Math.round(o.size * 0.92);
  for (const w of words) {
    if (w.glyph) {
      const g = await glyph(w.glyph, gh, GLYPH_COLOR[w.glyph] ?? COL.glyph);
      Object.assign(w, { width: g.width, buf: g.buf, gh: g.height });
    } else {
      w.width = (await measure(w.text, o)).width;
      w.tight = /^[.,;:!?)]+$/.test(w.text);
    }
  }
  const lines = [];
  let line = [], lw = 0;
  for (const w of words) {
    const add = (line.length && !w.tight ? space : 0) + w.width;
    if (line.length && !w.tight && lw + add > width) { lines.push({ items: line, width: lw }); line = []; lw = 0; }
    lw += (line.length && !w.tight ? space : 0) + w.width;
    line.push(w);
  }
  if (line.length) lines.push({ items: line, width: lw });
  let y = first ?? Math.round(centerY - ((lines.length - 1) * lineH) / 2 + o.size * 0.33);
  const ops = [];
  for (const l of lines) {
    let cx = x + (width - l.width) / 2;
    l.items.forEach((w, i) => {
      if (i && !w.tight) cx += space;
      if (w.glyph) ops.push({ input: w.buf, left: Math.round(cx), top: Math.round(y - w.gh + o.size * 0.1) });
      else ops.push({ ...{}, _text: w.text, _x: cx, _y: y });
      cx += w.width;
    });
    y += lineH;
  }
  const out = [];
  for (const op of ops) out.push(op._text ? await textAt(op._text, o, op._x, op._y, "left") : op);
  return { ops: out, lines: lines.length };
}

// ─── image helpers ───────────────────────────────────────────────────────────
function hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx];
}
function dilate(m, W, H, r) {
  const o = new Uint8Array(W * H);
  const offs = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) offs.push([dx, dy]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (m[y * W + x]) { o[y * W + x] = 1; continue; }
    for (const [dx, dy] of offs) {
      const X = x + dx, Y = y + dy;
      if (X >= 0 && Y >= 0 && X < W && Y < H && m[Y * W + X]) { o[y * W + x] = 1; break; }
    }
  }
  return o;
}
const erode = (m, W, H, r) => dilate(m.map((v) => 1 - v), W, H, r).map((v) => 1 - v);
function components(m, W, H) {
  const lab = new Int32Array(W * H).fill(-1);
  const comps = [];
  for (let p = 0; p < W * H; p++) {
    if (!m[p] || lab[p] >= 0) continue;
    const id = comps.length, st = [p];
    let n = 0, border = false, x0 = W, y0 = H, x1 = 0, y1 = 0;
    lab[p] = id;
    while (st.length) {
      const q = st.pop(); n++;
      const x = q % W, y = (q / W) | 0;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) border = true;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (const k of [q - 1, q + 1, q - W, q + W]) {
        if (k < 0 || k >= W * H) continue;
        if ((k === q - 1 && x === 0) || (k === q + 1 && x === W - 1)) continue;
        if (m[k] && lab[k] < 0) { lab[k] = id; st.push(k); }
      }
    }
    comps.push({ n, border, x0, y0, x1, y1 });
  }
  return { lab, comps };
}
function fillHoles(m, W, H) {
  const bg = new Uint8Array(W * H), st = [];
  for (let x = 0; x < W; x++) st.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) st.push(y * W, y * W + W - 1);
  while (st.length) {
    const q = st.pop();
    if (bg[q] || m[q]) continue;
    bg[q] = 1;
    const x = q % W;
    if (x > 0) st.push(q - 1);
    if (x < W - 1) st.push(q + 1);
    if (q >= W) st.push(q - W);
    if (q < W * (H - 1)) st.push(q + W);
  }
  const o = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) o[p] = bg[p] ? 0 : 1;
  return o;
}
/** Mask (0/1) → soft alpha PNG buffer (w x h, single white layer with alpha). */
async function maskToAlpha(m, W, H, blur = 0.8) {
  const d = Buffer.alloc(W * H);
  for (let p = 0; p < W * H; p++) d[p] = m[p] ? 255 : 0;
  let img = sharp(d, { raw: { width: W, height: H, channels: 1 } });
  if (blur) img = img.blur(blur);
  return img.png().toBuffer();
}
/** Apply a 1-channel alpha buffer to an RGB(A) image of the same size. */
async function withAlpha(imgBuf, alphaBuf) {
  const rgb = await sharp(imgBuf).removeAlpha().png().toBuffer();
  const a = await sharp(alphaBuf).extractChannel(0).toBuffer();
  return sharp(rgb).joinChannel(a).png().toBuffer();
}
function feather(w, h, r) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><filter id="b" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="${r / 2}"/></filter></defs><rect x="${r}" y="${r}" width="${w - 2 * r}" height="${h - 2 * r}" fill="#fff" filter="url(#b)"/></svg>`);
}
async function tilePatch(img, strip, region) {
  const base = await sharp(img).extract(strip).png().toBuffer();
  const flop = await sharp(base).flop().png().toBuffer();
  const flip = await sharp(base).flip().png().toBuffer();
  const both = await sharp(base).flip().flop().png().toBuffer();
  const patch = await sharp({ create: { width: strip.width * 2, height: strip.height * 2, channels: 4, background: "#000" } })
    .composite([{ input: base, left: 0, top: 0 }, { input: flop, left: strip.width, top: 0 }, { input: flip, left: 0, top: strip.height }, { input: both, left: strip.width, top: strip.height }]).png().toBuffer();
  const tile = await sharp(patch).extract({ left: 0, top: 0, width: Math.min(strip.width * 2, region.width), height: Math.min(strip.height * 2, region.height) }).png().toBuffer();
  const input = await sharp({ create: { width: region.width, height: region.height, channels: 4, background: "#000" } }).composite([{ input: tile, tile: true, gravity: "northwest" }]).png().toBuffer();
  return input;
}
/** Tile a clean strip over a region, feathered into the surroundings. */
async function patchOp(img, strip, region, r = 6) {
  const t = await tilePatch(img, strip, region);
  const input = await sharp(t).composite([{ input: feather(region.width, region.height, r), blend: "dest-in" }]).png().toBuffer();
  return { input, left: region.left, top: region.top };
}

/** Mean / std per channel over some rects of an image. */
async function stats(img, rects) {
  const acc = [[0, 0], [0, 0], [0, 0]];
  let n = 0;
  for (const r of rects) {
    const { data, w, h } = await raw(img, r);
    for (let p = 0; p < w * h; p++) for (let c = 0; c < 3; c++) { const v = data[p * 4 + c]; acc[c][0] += v; acc[c][1] += v * v; }
    n += w * h;
  }
  return acc.map(([s, s2]) => { const m = s / n; return [m, Math.sqrt(Math.max(1, s2 / n - m * m))]; });
}
/**
 * Clean leather for a card interior: the real printed-card leather texture
 * (specialty-card/leather.webp) with its colour statistics matched to the
 * template's own clean leather.
 */
async function leatherFor(img, sampleRects, w, h, seed = 0) {
  const target = await stats(img, sampleRects);
  const src = await sharp(read(`${A}/specialty-card/leather.webp`)).rotate(seed % 2 ? 180 : 0).resize(w, h, { fit: "cover" }).png().toBuffer();
  const s = await stats(src, [{ left: 0, top: 0, width: w, height: h }]);
  const { data } = await raw(src);
  for (let p = 0; p < w * h; p++) for (let c = 0; c < 3; c++) {
    const v = (data[p * 4 + c] - s[c][0]) / s[c][1] * target[c][1] + target[c][0];
    data[p * 4 + c] = Math.max(0, Math.min(255, Math.round(v)));
  }
  return png(fromRaw(data, w, h));
}

// ─── consensus frame mask ────────────────────────────────────────────────────
/**
 * Pixels of `R` in `baseFile` that agree (after a small alignment search) with
 * every other scan of the same printed frame are frame/ornament. Returns the
 * cleaned mask plus the bounding box of the largest non-frame blob (the
 * painting window).
 */
async function frameMask(baseFile, refFiles, R, { pad = 7, T = 46, keep = [], inset = 3 } = {}) {
  const blurRaw = async (f, r) => raw(await sharp(read(f)).extract(r).blur(1.1).png().toBuffer());
  const B = await blurRaw(baseFile, R);
  const big = { left: R.left - pad, top: R.top - pad, width: R.width + 2 * pad, height: R.height + 2 * pad };
  const votes = new Uint8Array(R.width * R.height);
  const W = R.width, H = R.height;
  for (const f of refFiles) {
    const Q = await blurRaw(f, big);
    let best = [0, 0, Infinity];
    for (let dy = -pad; dy <= pad; dy++) for (let dx = -pad; dx <= pad; dx++) {
      let s = 0;
      for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) {
        const i = (y * W + x) * 4, j = ((y + pad + dy) * Q.w + (x + pad + dx)) * 4;
        s += Math.min(60, Math.abs(B.data[i] - Q.data[j]) + Math.abs(B.data[i + 1] - Q.data[j + 1]) + Math.abs(B.data[i + 2] - Q.data[j + 2]));
      }
      if (s < best[2]) best = [dx, dy, s];
    }
    const [dx, dy] = best;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, j = ((y + pad + dy) * Q.w + (x + pad + dx)) * 4;
      const d = Math.abs(B.data[i] - Q.data[j]) + Math.abs(B.data[i + 1] - Q.data[j + 1]) + Math.abs(B.data[i + 2] - Q.data[j + 2]);
      if (d < T) votes[y * W + x]++;
    }
  }
  let m = new Uint8Array(W * H);
  const need = refFiles.length - 1;
  for (let p = 0; p < W * H; p++) m[p] = votes[p] >= need ? 1 : 0;
  m = erode(dilate(m, W, H, 2), W, H, 2); // close speckle gaps in the frame
  m = dilate(erode(m, W, H, 1), W, H, 1); // drop thin noise
  const { lab, comps } = components(m, W, H);
  for (let p = 0; p < W * H; p++) if (m[p] && !comps[lab[p]].border) m[p] = 0; // frame touches the edge of R
  // the painting window = largest non-frame blob
  const inv = m.map((v) => 1 - v);
  const ci = components(inv, W, H);
  let win = null;
  for (const c of ci.comps) if (!win || c.n > win.n) win = c;
  const id = ci.comps.indexOf(win);
  for (let p = 0; p < W * H; p++) if (!m[p] && ci.lab[p] !== id) m[p] = 1; // stray islands inside frame stay scan
  const rect = { left: R.left + win.x0, top: R.top + win.y0, width: win.x1 - win.x0 + 1, height: win.y1 - win.y0 + 1 };
  // inside the window only the printed ornaments listed in `keep` may stay:
  // any other "agreement" there is two dark paintings matching by chance
  const inZone = (X, Y, z) => X >= z.left && X < z.left + z.width && Y >= z.top && Y < z.top + z.height;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const X = R.left + x, Y = R.top + y;
    if (X < rect.left + inset || X >= rect.left + rect.width - inset || Y < rect.top + inset || Y >= rect.top + rect.height - inset) continue;
    if (!keep.some((z) => inZone(X, Y, z))) m[y * W + x] = 0;
  }
  m = dilate(m, W, H, 1);
  return { m, W, H, R, rect };
}
/** Composite `art` (already sized to the mask's R) where the mask is not frame. */
async function paintThroughMask(fm, artBuf) {
  const inv = fm.m.map((v) => 1 - v);
  const alpha = await maskToAlpha(inv, fm.W, fm.H, 0.7);
  return { input: await withAlpha(artBuf, alpha), left: fm.R.left, top: fm.R.top };
}
/** Art cover-cropped to the window, placed on an R-sized canvas. */
async function artForWindow(fm, file, crop) {
  let img = sharp(read(file));
  if (crop) img = img.extract(crop);
  const win = await img.resize(fm.rect.width + 4, fm.rect.height + 4, { fit: "cover", position: "centre" }).png().toBuffer();
  return sharp({ create: { width: fm.W, height: fm.H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: win, left: fm.rect.left - fm.R.left - 2, top: fm.rect.top - fm.R.top - 2 }]).png().toBuffer();
}
async function debugMask(name, fm, baseFile) {
  if (!DEBUG) return;
  const { data } = await raw(read(baseFile), fm.R);
  for (let p = 0; p < fm.W * fm.H; p++) if (fm.m[p]) { data[p * 4] = 255; data[p * 4 + 1] = 0; data[p * 4 + 2] = 255; }
  await fromRaw(data, fm.W, fm.H).png().toFile(`${DEBUG}/mask-${name}.png`);
}

// ─── keyed cut-outs of real printed pictures ─────────────────────────────────
/** Cut a picture off card leather (brown, mid/low value) → RGBA buffer. */
async function keyOffLeather(file, rect, { vMax = 0.56, hMin = 4, hMax = 46, sMin = 0.22 } = {}) {
  const { data, w, h } = await raw(read(file), rect);
  let m = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const [hh, s, v] = hsv(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]);
    const leather = hh >= hMin && hh <= hMax && s >= sMin && v <= vMax;
    m[p] = leather ? 0 : 1;
  }
  m = dilate(erode(m, w, h, 1), w, h, 1);
  m = erode(dilate(m, w, h, 3), w, h, 3);
  const { lab, comps } = components(m, w, h);
  let big = 0;
  for (const c of comps) big = Math.max(big, c.n);
  for (let p = 0; p < w * h; p++) if (m[p] && comps[lab[p]].n < big * 0.04) m[p] = 0;
  m = fillHoles(m, w, h);
  const alpha = await maskToAlpha(m, w, h, 1.0);
  return withAlpha(await png(fromRaw(data, w, h)), alpha);
}

/**
 * The Weakness spell SYMBOL off the real spells-weakness card: crouching
 * knight, dropped sword, blue ribbon + golden shell. The tan parchment is keyed
 * out; the thin/tan-coloured parts (sword blade, scabbard, shell) get relaxed
 * keys inside hand-traced corridors.
 */
async function weaknessSymbol({ knightOnly = false } = {}) {
  const R = { left: 100, top: 170, width: 510, height: 340 };
  const { data, w: W, h: H } = await raw(read(`${A}/spells-weakness.webp`), R);
  const inPoly = (x, y, poly) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const toLocal = (pts) => pts.map(([x, y]) => [x - R.left, y - R.top]);
  const shell = toLocal([[115, 445], [120, 440], [150, 428], [167, 430], [180, 445], [183, 470], [178, 490], [163, 500], [143, 498], [127, 487], [115, 470]]);
  const corridor = (x0, y0, x1, y1, half) => {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), nx = (-dy / L) * half, ny = (dx / L) * half;
    return toLocal([[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]]);
  };
  const blade = corridor(505, 372, 592, 268, 9);
  const scabbard = corridor(274, 246, 213, 414, 11);
  let m = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x;
    const [hh, s, v] = hsv(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]);
    const tan = hh >= 20 && hh <= 50 && s >= 0.12 && s <= 0.62 && v >= 0.3;
    let fg = !tan;
    if (inPoly(x, y, shell)) fg = true;
    else if (inPoly(x, y, blade)) fg = fg || s < 0.3 || v > 0.63 || v < 0.4;
    else if (inPoly(x, y, scabbard)) fg = fg || v < 0.47 || hh < 24;
    if (knightOnly) {
      const X = x + R.left, Y = y + R.top;
      const ribbon = hh >= 200 && hh <= 300 && s > 0.15;
      if (X < 207 || inPoly(x, y, shell) || (ribbon && X < 278 && Y > 428)) fg = false;
    }
    m[p] = fg ? 1 : 0;
  }
  m = dilate(erode(m, W, H, 1), W, H, 1);
  m = erode(dilate(m, W, H, 3), W, H, 3);
  const { lab, comps } = components(m, W, H);
  for (let p = 0; p < W * H; p++) if (m[p] && comps[lab[p]].n < 250) m[p] = 0;
  m = fillHoles(m, W, H);
  const alpha = await maskToAlpha(m, W, H, 0.9);
  const cut = await withAlpha(await png(fromRaw(data, W, H)), alpha);
  return sharp(cut).trim({ threshold: 1 }).png().toBuffer();
}

/** Soft drop shadow under an RGBA cut-out (like the printed pictures). */
async function withShadow(buf, { dx = 4, dy = 6, blur = 6, opacity = 0.55 } = {}) {
  const m = await sharp(buf).metadata();
  const padd = blur * 3 + Math.max(dx, dy);
  const a = await sharp(buf).extractChannel(3).toBuffer();
  const black = await sharp({ create: { width: m.width, height: m.height, channels: 3, background: "#000" } }).png().toBuffer();
  const sh = await sharp(black).joinChannel(await sharp(a).linear(opacity, 0).toBuffer()).png().toBuffer();
  const W = m.width + 2 * padd, H = m.height + 2 * padd;
  const shadow = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: sh, left: padd + dx, top: padd + dy }]).blur(blur).png().toBuffer();
  const input = await sharp(shadow).composite([{ input: buf, left: padd, top: padd }]).png().toBuffer();
  return { input, pad: padd, width: W, height: H };
}
/** Fit an RGBA picture into a box (contain), returning a composite op. */
async function fitInto(buf, box, { shadow = null } = {}) {
  const img = await sharp(buf).resize(box.width, box.height, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const t = await sharp(img).trim({ threshold: 1 }).png().toBuffer({ resolveWithObject: true });
  const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
  if (shadow) {
    const s = await withShadow(t.data, shadow);
    return { input: s.input, left: Math.round(cx - t.info.width / 2 - s.pad), top: Math.round(cy - t.info.height / 2 - s.pad) };
  }
  return { input: t.data, left: Math.round(cx - t.info.width / 2), top: Math.round(cy - t.info.height / 2) };
}
// ─── specialty cards ─────────────────────────────────────────────────────────
const CARD_TXT = {
  title: { size: 45, sx: 1.17, fill: COL.title },
  sandroBody: { size: 29, sx: 1.14, fill: COL.body, weight: "normal", shadow: 0.6 },
  sandroBodyTight: { size: 27.5, sx: 1.12, fill: COL.body, weight: "normal", shadow: 0.6 },
  subtitleTight: { size: 29, sx: 1.2, fill: COL.subtitle, weight: "normal", shadow: 0.6 },
  digitTight: { size: 36, sx: 1.05, fill: COL.digit },
  ability: { size: 26.5, sx: 1.1, fill: COL.body, weight: "normal", shadow: 0.6 },
  ashBody: { size: 30.5, sx: 1.09, fill: COL.body, weight: "normal", shadow: 0.6 },
  subtitle: { size: 31, sx: 1.2, fill: COL.subtitle, weight: "normal", shadow: 0.6 },
  digit: { size: 41, sx: 1.05, fill: COL.digit },
  footer: { size: 19.5, sx: 1, fill: "#cfcfcf", weight: "normal", shadow: 0, font: "Calibri" },
};
/**
 * Clean leather plate for a card template. Every printed hero-specialty card
 * shares ONE leather print, so the other scans (aligned to this template by a
 * small offset search, exposure-matched on clean side strips) are stacked and,
 * per pixel, the median of the samples that look like bare leather is taken —
 * text, symbols and pictures sit in different places on different cards and
 * drop out. The result is this template's own leather, minus its print.
 */
const PLATE = { left: 64, top: 58, width: 614, height: 690 };
const PLATE_STRIPS = [{ left: 74, top: 130, width: 30, height: 560 }, { left: 638, top: 130, width: 30, height: 560 }];
let plateCards = null;
/** Generated (non-scan) specialty faces: never stacked into a leather plate. */
export const PLATE_EXCLUDE = new Set(["ignatius", "olema", "jabarkas", "cuthbert", "urftin", "uland", "kastore", "isra", "dace", "darkstorn", "korbac", "verdish"]);
const MIN_SAMPLES = 10;
async function leatherPlate(tplFile) {
  const pad = 8;
  const big = { left: PLATE.left - pad, top: PLATE.top - pad, width: PLATE.width + 2 * pad, height: PLATE.height + 2 * pad };
  if (!plateCards) {
    const { readdirSync } = await import("node:fs");
    const files = readdirSync(A).filter((n) => /^hero_specialties-[a-z_]+-(1|6).webp$/.test(n) && !PLATE_EXCLUDE.has(n.replace(/^hero_specialties-|-(1|6).webp$/g, ""))).sort();
    plateCards = [];
    for (const n of files) {
      const { data, w, h } = await raw(read(`${A}/${n}`), big);
      plateCards.push({ n, data, w, h });
    }
  }
  const T = await raw(read(tplFile), PLATE);
  const W = PLATE.width, H = PLATE.height;
  const lum = (d, i) => d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
  const stripPx = [];
  for (const r of PLATE_STRIPS) for (let y = r.top; y < r.top + r.height; y += 2) for (let x = r.left; x < r.left + r.width; x += 2) stripPx.push([x - PLATE.left, y - PLATE.top]);
  const tMean = [0, 0, 0];
  for (const [x, y] of stripPx) for (let c = 0; c < 3; c++) tMean[c] += T.data[(y * W + x) * 4 + c] / stripPx.length;
  const aligned = [];
  for (const card of plateCards) {
    if (tplFile.endsWith(card.n)) continue;
    let best = [0, 0, Infinity];
    for (let dy = -pad; dy <= pad; dy++) for (let dx = -pad; dx <= pad; dx++) {
      let sum = 0;
      for (const [x, y] of stripPx) sum += Math.min(40, Math.abs(lum(T.data, (y * W + x) * 4) - lum(card.data, ((y + pad + dy) * card.w + x + pad + dx) * 4)));
      if (sum < best[2]) best = [dx, dy, sum];
    }
    const [dx, dy, cost] = best;
    if (cost / stripPx.length > 22) continue; // not the same print / too different a scan
    // cards with a printed picture window (dark ruled box) would ghost it in:
    // look for a dark vertical rule left of centre or a dark horizontal rule under it
    const at = (x, y) => lum(card.data, ((y - PLATE.top + pad + dy) * card.w + x - PLATE.left + pad + dx) * 4);
    const cols = [], rows = [];
    for (let x = 205; x <= 255; x++) { let m = 0; for (let y = 140; y < 320; y += 3) m += at(x, y) / 60; cols.push(m); }
    for (let y = 325; y <= 395; y++) { let m = 0; for (let x = 290; x < 450; x += 3) m += at(x, y) / 54; rows.push(m); }
    const med = (a) => [...a].sort((p, q) => p - q)[a.length >> 1];
    if (Math.min(...cols) < med(cols) * 0.72 || Math.min(...rows) < med(rows) * 0.72) continue;
    const cMean = [0, 0, 0];
    for (const [x, y] of stripPx) for (let c = 0; c < 3; c++) cMean[c] += card.data[((y + pad + dy) * card.w + x + pad + dx) * 4 + c] / stripPx.length;
    aligned.push({ card, dx, dy, gain: tMean.map((m, c) => m / Math.max(1, cMean[c])) });
  }
  const out = Buffer.alloc(W * H * 4);
  const thinMask = new Uint8Array(W * H);
  const sv = [[], [], []];
  let thin = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    sv[0].length = sv[1].length = sv[2].length = 0;
    for (const a of aligned) {
      const j = ((y + pad + a.dy) * a.card.w + x + pad + a.dx) * 4;
      const r = a.card.data[j] * a.gain[0], g = a.card.data[j + 1] * a.gain[1], b = a.card.data[j + 2] * a.gain[2];
      const [hh, ss, vv] = hsv(Math.min(255, r), Math.min(255, g), Math.min(255, b));
      if (hh < 6 || hh > 38 || ss < 0.32 || ss > 0.8 || vv < 0.15 || vv > 0.5) continue;
      sv[0].push(r); sv[1].push(g); sv[2].push(b);
    }
    const i = (y * W + x) * 4;
    // too few clean samples (where most cards print ink, e.g. the shared
    // title line under the symbol): a low percentile of a handful of samples
    // picks ink-fringe pixels row by row and prints a striped ladder, so such
    // pixels are filled from the surroundings instead
    if (sv[0].length < MIN_SAMPLES) { thin++; thinMask[y * W + x] = 1; }
    else for (let c = 0; c < 3; c++) { const v = sv[c].sort((p, q) => p - q); out[i + c] = Math.round(v[Math.floor(v.length * 0.4)]); }
    out[i + 3] = 255;
  }
  // pixels no clean scan covers (the symbol spot every card prints on):
  // normalised-convolution fill from the surrounding plate + leather grain
  if (thin) {
    const grown = dilate(thinMask, W, H, 4); // the fringe of the gap is unreliable too
    thinMask.set(grown);
    // normalised convolution with separate (non-alpha) colour and weight planes
    const valid = Buffer.alloc(W * H * 3), weight = Buffer.alloc(W * H);
    for (let p = 0; p < W * H; p++) if (!thinMask[p]) { for (let c = 0; c < 3; c++) valid[p * 3 + c] = out[p * 4 + c]; weight[p] = 255; }
    // 8-bit blurs quantise the weight plane to a few levels deep inside a big
    // gap, and colour/weight then divides into a striped ladder — so fall back
    // to coarser scales wherever the weight is too small to divide reliably
    const scales = [];
    for (const sigma of [14, 32, 70]) {
      scales.push({ bc: await fromRaw(valid, W, H, 3).blur(sigma).removeAlpha().raw().toBuffer(), bw: await fromRaw(weight, W, H, 1).blur(sigma).extractChannel(0).raw().toBuffer() });
    }
    const MIN_W = 64;
    const grain = await raw(await sharp(read(`${A}/specialty-card/leather.webp`)).resize(W, H, { fit: "cover" }).png().toBuffer());
    const grainBlur = await raw(await sharp(read(`${A}/specialty-card/leather.webp`)).resize(W, H, { fit: "cover" }).blur(14).png().toBuffer());
    for (let p = 0; p < W * H; p++) {
      if (!thinMask[p]) continue;
      const sc = scales.find((q) => q.bw[p] >= MIN_W) ?? scales[scales.length - 1];
      const a = Math.max(1, sc.bw[p]) / 255;
      for (let c = 0; c < 3; c++) {
        const detail = (grain.data[p * 4 + c] - grainBlur.data[p * 4 + c]) * 0.6;
        out[p * 4 + c] = Math.max(0, Math.min(255, Math.round(sc.bc[p * 3 + c] / a + detail)));
      }
    }
  }
  // the low percentile runs a touch dark: re-match exposure on the clean strips
  const pMean = [0, 0, 0];
  for (const [x, y] of stripPx) for (let c = 0; c < 3; c++) pMean[c] += out[(y * W + x) * 4 + c] / stripPx.length;
  for (let p = 0; p < W * H; p++) for (let c = 0; c < 3; c++) out[p * 4 + c] = Math.min(255, Math.round(out[p * 4 + c] * tMean[c] / pMean[c]));
  console.log(`  leather plate for ${tplFile.split("/").pop()}: ${aligned.length} scans stacked, ${thin} thin px`);
  return png(fromRaw(out, W, H));
}

/** Leather interior region of a card (inside the border, above the band). */
const INTERIOR = [
  { left: 70, top: 108, width: 602, height: 634 },
  { left: 108, top: 75, width: 526, height: 50 },
];
const LEATHER_SAMPLES = [
  { left: 74, top: 130, width: 26, height: 560 },
  { left: 642, top: 130, width: 26, height: 560 },
];
async function relaidLeather(tplFile) {
  const plate = await leatherPlate(tplFile);
  if (DEBUG) await sharp(plate).png().toFile(`${DEBUG}/plate-${tplFile.split("/").pop()}.png`);
  // one union mask (body + the strip between the top corner ornaments), softly edged
  const rects = INTERIOR.map((r) => `<rect x="${r.left - PLATE.left}" y="${r.top - PLATE.top}" width="${r.width}" height="${r.height}"/>`).join("");
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${PLATE.width}" height="${PLATE.height}"><defs><filter id="b"><feGaussianBlur stdDeviation="2.5"/></filter></defs><g fill="#fff" filter="url(#b)">${rects}</g></svg>`);
  return [{ input: await sharp(plate).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer(), left: PLATE.left, top: PLATE.top }];
}
/** Swap the portrait panel of a card under the consensus frame mask. */
async function cardPortrait(tplFile, level, heroOthers, master, crop) {
  const refs = heroOthers.map((h) => `${A}/hero_specialties-${h}-${level}.webp`);
  const fm = await frameMask(tplFile, refs, { left: 36, top: 730, width: 290, height: 272 });
  return fm;
}

export {
  A, FONT, COL, read, png, raw, fromRaw, textSvg, measure, textAt, glyph, layoutText,
  hsv, dilate, erode, components, fillHoles, maskToAlpha, withAlpha, feather, tilePatch, patchOp,
  stats, leatherFor, frameMask, paintThroughMask, debugMask, keyOffLeather, weaknessSymbol,
  withShadow, fitInto, CARD_TXT, PLATE, leatherPlate, INTERIOR, relaidLeather,
};

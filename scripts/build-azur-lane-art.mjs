#!/usr/bin/env node

// OFFLINE composite of the full Azur Lane (`azur_lane`) anime-town art suite,
// Step 1 (art only — no game code references these files yet). Reads the REAL
// character refs fetched by fetch-azur-lane-art.mjs (run that FIRST) and builds
// every public/assets output the eventual data wiring will consume, mirroring
// the Hidden Leaf precedent (scripts/build-hidden-leaf-placeholder-art.mjs):
// every output's pixel dimensions are read LIVE from its azure_breeze / anime
// twin with sharp.metadata() and reused verbatim, then re-asserted after write.
//
// Deterministic + idempotent (no RNG): re-running overwrites the same outputs.
// Fails loudly if a required ref is missing.
//
// Design language: deep-ocean navy gradients, an azure character glow, white
// wake arcs, a white/gold "white-glove navy" double frame, a tier-coloured name
// band, an anchor emblem, and a FEW (steel-blue) / PACK (gold) corner ribbon.
// Pack sides with no distinct Retrofit art flip horizontally and gain a faded
// "squadron" echo, so all 14 unit files are byte-distinct and distinguishable.
//
// Run (after the fetch step): node scripts/build-azur-lane-art.mjs

import { existsSync, statSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(root, "public", "assets");
const refDir = path.join(root, "scripts", "anime-art", "refs", "azur-lane");

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const f1 = (n) => Number(n).toFixed(1);
const f2 = (n) => Number(n).toFixed(2);

// Deterministic PRNG (mulberry32) — fixed seeds give identical scatter every run.
function mulberry(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const refPath = (ref) => path.join(refDir, `${ref}.img`);
const refExists = (ref) => existsSync(refPath(ref)) && statSync(refPath(ref)).size > 0;
async function loadRefBuf(ref) {
  if (!refExists(ref)) {
    throw new Error(`Missing required art ref "${ref}" (${path.relative(root, refPath(ref))}). Run fetch-azur-lane-art.mjs first.`);
  }
  return readFile(refPath(ref));
}

async function mirrorMeta(rel) {
  const m = await sharp(path.join(assets, rel)).metadata();
  if (!m.width || !m.height) throw new Error(`No dimensions for mirror source: ${rel}`);
  return { width: m.width, height: m.height };
}

// Rasterize an SVG string to an exact WxH RGBA PNG buffer.
async function svgRaster(svg, W, H) {
  return sharp(Buffer.from(svg)).resize(W, H, { fit: "fill" }).png().toBuffer();
}

// Scale an RGBA buffer's existing alpha by `opacity` (Porter-Duff dest-in with a
// uniform-alpha source — the standard sharp opacity trick).
async function fade(buf, opacity) {
  const a = Math.max(0, Math.min(255, Math.round(255 * opacity)));
  return sharp(buf)
    .ensureAlpha()
    .composite([{ input: Buffer.from([255, 255, 255, a]), raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: "dest-in" }])
    .png()
    .toBuffer();
}

// Deterministic fine grain (film-grain / sea-sparkle texture). High-frequency
// detail that both enriches the flat vector scene and keeps the exported webp
// above the size floor. No RNG — the value is a hash of the pixel index.
async function grainOverlay(W, H, alpha) {
  const buf = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    let x = Math.imul(i ^ 0x9e3779b9, 2654435761) >>> 0;
    x ^= x >>> 15;
    x = Math.imul(x, 2246822519) >>> 0;
    x ^= x >>> 13;
    const v = x & 0xff;
    const o = i * 4;
    buf[o] = v;
    buf[o + 1] = v;
    buf[o + 2] = v;
    buf[o + 3] = alpha;
  }
  return sharp(buf, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
}
async function applyGrain(sceneBuf, W, H, alpha = 90) {
  const grain = await grainOverlay(W, H, alpha);
  return sharp(sceneBuf).composite([{ input: grain, blend: "overlay" }]).png().toBuffer();
}

// Fade + darken a buffer so a SECONDARY (different) character reads as receding
// behind the dominant one (depth): scale alpha AND dim brightness.
async function depthFade(buf, alpha, brightness) {
  const a = Math.max(0, Math.min(255, Math.round(255 * alpha)));
  return sharp(buf)
    .ensureAlpha()
    .modulate({ brightness })
    .composite([{ input: Buffer.from([255, 255, 255, a]), raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: "dest-in" }])
    .png()
    .toBuffer();
}

// Scale a character to DOMINATE the card: fill `targetH` in height, but allow it
// to grow up to `maxW` wide (a wide illustration then gets a modest centre-crop
// down to `hardMaxW` so it still fills the frame instead of shrinking to a small
// figure). Aspect is always preserved; the crop is the only thing that trims.
async function fitCharacter(srcBuf, { flop, targetH, maxW, hardMaxW }) {
  const meta0 = await sharp(srcBuf).metadata();
  const aspect = meta0.width / meta0.height;
  let renderH = targetH;
  let renderW = Math.round(renderH * aspect);
  if (renderW > maxW) {
    renderW = maxW;
    renderH = Math.round(renderW / aspect);
  }
  let pipe = sharp(srcBuf);
  if (flop) pipe = pipe.flop();
  let buf = await pipe.resize({ width: renderW, height: renderH, fit: "inside" }).png().toBuffer();
  let m = await sharp(buf).metadata();
  if (m.width > hardMaxW) {
    const cropLeft = Math.round((m.width - hardMaxW) / 2);
    buf = await sharp(buf).extract({ left: cropLeft, top: 0, width: hardMaxW, height: m.height }).png().toBuffer();
    m = await sharp(buf).metadata();
  }
  return { buf, w: m.width, h: m.height };
}

// Compose the layers placing a dominant PRIMARY character bottom-centre anchored
// (~80% of card height, crisp). A SECONDARY ref (a DIFFERENT shipgirl) is
// composited behind-left at ~56% height with a depth fade (a two-ship card); an
// echoSelf flips the primary and fades a self-copy behind (fallback treatment).
async function characterLayers(W, H, { primary, secondary, flopPrimary = false, echoSelf = false, box }) {
  const boxBottom = Math.round(H * box.bottom);
  const hardMaxW = Math.round(W * (box.hardMaxWidthFrac ?? 1));
  const primBuf = await loadRefBuf(primary);

  const main = await fitCharacter(primBuf, {
    flop: flopPrimary,
    targetH: Math.round(H * box.heightFrac),
    maxW: Math.round(W * box.maxWidthFrac),
    hardMaxW
  });

  const layers = [];
  if (secondary) {
    const s = await fitCharacter(await loadRefBuf(secondary), {
      flop: false,
      targetH: Math.round(H * box.heightFrac * 0.68),
      maxW: Math.round(W * 0.82),
      hardMaxW: Math.round(W * 0.82)
    });
    layers.push({ input: await depthFade(s.buf, 0.82, 0.72), left: Math.max(0, Math.round(W * 0.02)), top: boxBottom - s.h });
  } else if (echoSelf) {
    const e = await fitCharacter(primBuf, {
      flop: true,
      targetH: Math.round(H * box.heightFrac * 0.72),
      maxW: Math.round(W * 0.9),
      hardMaxW: Math.round(W * 0.9)
    });
    layers.push({ input: await fade(e.buf, 0.24), left: Math.max(0, Math.round(W * 0.07)), top: boxBottom - e.h });
  }

  // shift the primary toward centre-right when a secondary sits at the left
  const shift = secondary ? Math.round(W * 0.1) : 0;
  const left = Math.max(0, Math.min(W - main.w, Math.round((W - main.w) / 2) + shift));
  layers.push({ input: main.buf, left, top: boxBottom - main.h });
  return layers;
}

// Fit a title into a band box as up to `maxLines` greedily-wrapped lines, picking
// the largest DejaVu-Sans-bold font size that fits both width and height.
function layoutBandTitle(label, boxW, boxH, maxLines) {
  const words = String(label).trim().split(/\s+/);
  for (let fs = Math.floor(boxH); fs >= 8; fs--) {
    const maxChars = boxW / (fs * 0.62);
    const lines = [];
    let cur = "";
    for (const w of words) {
      const cand = cur ? `${cur} ${w}` : w;
      if (!cur || cand.length <= maxChars) cur = cand;
      else {
        lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    const lineH = fs * 1.16;
    const widest = Math.max(...lines.map((l) => l.length));
    if (lines.length <= maxLines && lineH * lines.length <= boxH && widest <= maxChars * 1.03) {
      return { fontSize: fs, lines, lineH };
    }
  }
  return { fontSize: 10, lines: [label], lineH: 12 };
}

function titleTextSvg(lines, cx, midY, fontSize, lineH, fill) {
  const startY = midY - (lineH * (lines.length - 1)) / 2 + fontSize * 0.34;
  return lines
    .map(
      (l, i) =>
        `<text x="${f1(cx)}" y="${f1(startY + i * lineH)}" font-family="DejaVu Sans, sans-serif" font-weight="700" font-size="${f1(
          fontSize
        )}" fill="${fill}" text-anchor="middle" style="letter-spacing:${f2(fontSize * 0.03)}px">${esc(l)}</text>`
    )
    .join("");
}

// A compact stroked anchor emblem centred at (cx,cy) with half-height s.
function anchorSvg(cx, cy, s, stroke) {
  const sw = f2(Math.max(1, s * 0.14));
  const top = cy - s;
  return `<g stroke="${stroke}" fill="none" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="${f1(cx)}" cy="${f1(top)}" r="${f2(s * 0.17)}"/>
    <line x1="${f1(cx)}" y1="${f1(top + s * 0.17)}" x2="${f1(cx)}" y2="${f1(cy + s * 0.86)}"/>
    <line x1="${f1(cx - s * 0.44)}" y1="${f1(top + s * 0.5)}" x2="${f1(cx + s * 0.44)}" y2="${f1(top + s * 0.5)}"/>
    <path d="M ${f1(cx - s * 0.64)} ${f1(cy + s * 0.28)} Q ${f1(cx - s * 0.64)} ${f1(cy + s * 0.9)} ${f1(cx)} ${f1(cy + s * 0.9)} Q ${f1(
    cx + s * 0.64
  )} ${f1(cy + s * 0.9)} ${f1(cx + s * 0.64)} ${f1(cy + s * 0.28)}"/>
    <line x1="${f1(cx - s * 0.64)}" y1="${f1(cy + s * 0.28)}" x2="${f1(cx - s * 0.86)}" y2="${f1(cy + s * 0.12)}"/>
    <line x1="${f1(cx + s * 0.64)}" y1="${f1(cy + s * 0.28)}" x2="${f1(cx + s * 0.86)}" y2="${f1(cy + s * 0.12)}"/>
  </g>`;
}

function ribbonSvg(W, H, text, isPack) {
  const rw = W * 0.32;
  const rh = H * 0.055;
  const x = W * 0.055;
  const y = H * 0.9;
  const col = isPack ? "#e7b73c" : "#3f6fa8";
  const txt = isPack ? "#3a2a06" : "#eef6ff";
  const ls = String(text).length > 6 ? 0.1 : 0.22;
  const fs = Math.min(rh * 0.56, (rw * 0.86) / (String(text).length * (0.62 + ls)));
  return `<g>
    <rect x="${f1(x)}" y="${f1(y)}" width="${f1(rw)}" height="${f1(rh)}" rx="${f1(rh * 0.2)}" fill="${col}" stroke="#081420" stroke-width="${f2(
    H * 0.0035
  )}"/>
    <text x="${f1(x + rw / 2)}" y="${f1(y + rh * 0.71)}" font-family="DejaVu Sans, sans-serif" font-weight="700" font-size="${f1(
    fs
  )}" fill="${txt}" text-anchor="middle" style="letter-spacing:${f2(fs * ls)}px">${esc(text)}</text>
  </g>`;
}

async function finalizeWebp(pipeline, outRel, expect, { minKb = 0, quality = 90 } = {}) {
  const outPath = path.join(assets, outRel);
  await mkdir(path.dirname(outPath), { recursive: true });
  await pipeline.webp({ quality, effort: 6 }).toFile(outPath);
  return verifyOut(outRel, expect, minKb);
}
async function finalizePng(pipeline, outRel, expect, { minKb = 0 } = {}) {
  const outPath = path.join(assets, outRel);
  await mkdir(path.dirname(outPath), { recursive: true });
  await pipeline.png({ compressionLevel: 9 }).toFile(outPath);
  return verifyOut(outRel, expect, minKb);
}
async function verifyOut(outRel, expect, minKb) {
  const outPath = path.join(assets, outRel);
  const m = await sharp(outPath).metadata();
  if (m.width !== expect.width || m.height !== expect.height) {
    throw new Error(`Dimension mismatch for ${outRel}: got ${m.width}x${m.height}, want ${expect.width}x${expect.height}`);
  }
  const bytes = statSync(outPath).size;
  if (minKb && bytes < minKb * 1024) {
    throw new Error(`${outRel} is ${(bytes / 1024).toFixed(1)}KB, below the ${minKb}KB minimum`);
  }
  const row = { path: path.relative(root, outPath), dims: `${m.width}x${m.height}`, bytes };
  TABLE.push(row);
  return row;
}
const TABLE = [];

// ---------------------------------------------------------------------------
// unit cards
// ---------------------------------------------------------------------------

const TIER_COLOR = { bronze: "#b46f33", silver: "#c7ccd6", golden: "#e7b73c" };
const AZURE_UNIT_BY_TIER = {
  bronze: "anime/units/azure-breeze/units-azure-breeze-bronze-outer-sect-disciples",
  silver: "anime/units/azure-breeze/units-azure-breeze-silver-sect-protectors",
  golden: "anime/units/azure-breeze/units-azure-breeze-golden-true-inheritors"
};

// slug + tier + label; each side names its primary ref (dominant character) and
// optional secondary ref (a different shipgirl composited behind). 3 bronze /
// 2 silver / 2 gold (mirrors hidden-leaf). Every side has real distinct art.
// ONE named shipgirl per card: FEW = base art, PACK = a distinct alt/retrofit
// skin of the SAME girl. slug is the girl; label is her name (name band, caps).
// 3 bronze / 2 silver / 2 gold (mirrors the azure-breeze tier spread).
const UNITS = [
  {
    slug: "laffey",
    tier: "bronze",
    label: "LAFFEY",
    few: { primary: "laffey-few" }, // Laffey (base)
    pack: { primary: "laffey-pack" } // Laffey (Retrofit)
  },
  {
    slug: "javelin",
    tier: "bronze",
    label: "JAVELIN",
    few: { primary: "javelin-few" }, // Javelin (Retrofit full-body — base art too low-res)
    pack: { primary: "javelin-pack" } // Javelin (Idol alt)
  },
  {
    slug: "honolulu",
    tier: "bronze",
    label: "HONOLULU",
    few: { primary: "honolulu-few" }, // Honolulu (base)
    pack: { primary: "honolulu-pack" } // Honolulu (Summer alt)
  },
  {
    slug: "unicorn",
    tier: "silver",
    label: "UNICORN",
    few: { primary: "unicorn-few" }, // Unicorn (base)
    pack: { primary: "unicorn-pack" } // Unicorn (Casual alt)
  },
  {
    slug: "yukikaze",
    tier: "silver",
    label: "YUKIKAZE",
    few: { primary: "yukikaze-few" }, // Yukikaze (base)
    pack: { primary: "yukikaze-pack" } // Yukikaze (Oath alt)
  },
  {
    slug: "prinz-eugen",
    tier: "golden",
    label: "PRINZ EUGEN",
    few: { primary: "prinz-eugen-few" }, // Prinz Eugen (base)
    pack: { primary: "prinz-eugen-pack" } // Prinz Eugen (Wedding alt)
  },
  {
    slug: "i-19",
    tier: "golden",
    label: "I-19",
    few: { primary: "i-19-few" }, // I-19 (base)
    pack: { primary: "i-19-pack" } // I-19 (School alt)
  }
];

function unitBgSvg(W, H) {
  let wake = "";
  for (let i = 0; i < 5; i++) {
    const ry = H * (0.17 + i * 0.05);
    const rx = W * (0.2 + i * 0.13);
    wake += `<ellipse cx="${f1(W / 2)}" cy="${f1(H * 0.9)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="none" stroke="#bfe0ff" stroke-width="${f2(
      W * 0.004
    )}" opacity="${f2(0.12 - i * 0.015)}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#153f72"/>
      <stop offset="0.5" stop-color="#0e2a4c"/>
      <stop offset="1" stop-color="#091a30"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.44" r="0.6">
      <stop offset="0" stop-color="#3778bd" stop-opacity="0.85"/>
      <stop offset="0.55" stop-color="#1c4e88" stop-opacity="0.4"/>
      <stop offset="1" stop-color="#091a30" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sea)"/>
  <ellipse cx="${f1(W / 2)}" cy="${f1(H * 0.48)}" rx="${f1(W * 0.44)}" ry="${f1(H * 0.42)}" fill="url(#glow)"/>
  ${wake}
</svg>`;
}

function unitFgSvg(W, H, tier, label, side) {
  const short = Math.min(W, H);
  const tc = TIER_COLOR[tier];
  const m = short * 0.022;
  const gw = short * 0.011;
  const wIn = short * 0.006;

  // name band (top)
  const bandX = W * 0.075;
  const bandY = H * 0.045;
  const bandW = W * 0.85;
  const bandH = H * 0.112;
  const cap = bandH; // square end-caps hold the anchor bookends
  const innerX = bandX + cap * 0.9;
  const innerW = bandW - cap * 1.8;
  const lay = layoutBandTitle(label, innerW * 0.94, bandH * 0.62, 2);
  const title = titleTextSvg(lay.lines, bandX + bandW / 2, bandY + bandH * 0.52, lay.fontSize, lay.lineH, "#0c1c30");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="band" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${tc}"/>
      <stop offset="1" stop-color="#e9eef6" stop-opacity="0.55"/>
    </linearGradient>
  </defs>
  <rect x="${f1(m)}" y="${f1(m)}" width="${f1(W - 2 * m)}" height="${f1(H - 2 * m)}" rx="${f1(short * 0.03)}" fill="none" stroke="#d9b45a" stroke-width="${f2(
    gw
  )}"/>
  <rect x="${f1(m + gw)}" y="${f1(m + gw)}" width="${f1(W - 2 * (m + gw))}" height="${f1(H - 2 * (m + gw))}" rx="${f1(
    short * 0.025
  )}" fill="none" stroke="#eef4ff" stroke-width="${f2(wIn)}" opacity="0.85"/>
  <g>
    <rect x="${f1(bandX)}" y="${f1(bandY)}" width="${f1(bandW)}" height="${f1(bandH)}" rx="${f1(bandH * 0.22)}" fill="url(#band)" stroke="#0b1a2c" stroke-width="${f2(
    short * 0.004
  )}"/>
    <rect x="${f1(innerX)}" y="${f1(bandY + bandH * 0.16)}" width="${f1(innerW)}" height="${f1(bandH * 0.68)}" rx="${f1(
    bandH * 0.14
  )}" fill="#eef4ff" opacity="0.8"/>
    ${anchorSvg(bandX + cap * 0.5, bandY + bandH * 0.5, bandH * 0.32, "#0c1c30")}
    ${anchorSvg(bandX + bandW - cap * 0.5, bandY + bandH * 0.5, bandH * 0.32, "#0c1c30")}
    ${title}
  </g>
  ${ribbonSvg(W, H, side.toUpperCase(), side === "pack")}
</svg>`;
}

async function renderUnitCard(u, side) {
  const spec = u[side];
  const outRel = `anime/units/azur-lane/units-azur-lane-${u.tier}-${u.slug}-${side}.webp`;
  const mirror = `${AZURE_UNIT_BY_TIER[u.tier]}-${side}.webp`;
  const { width: W, height: H } = await mirrorMeta(mirror);

  const bg = await svgRaster(unitBgSvg(W, H), W, H);
  const chars = await characterLayers(W, H, {
    primary: spec.primary,
    secondary: spec.secondary,
    // fill ~82% of card height; a wide illustration overshoots to 1.40x width
    // then centre-crops back to the card so the character always dominates.
    box: { bottom: 0.965, heightFrac: 0.82, maxWidthFrac: 1.4, hardMaxWidthFrac: 1 }
  });
  const fg = await svgRaster(unitFgSvg(W, H, u.tier, u.label, side), W, H);

  await finalizeWebp(
    sharp(bg).composite([...chars, { input: fg, left: 0, top: 0 }]),
    outRel,
    { width: W, height: H },
    { minKb: 50 }
  );
}

// ---------------------------------------------------------------------------
// hero portraits (plain art over a naval gradient + thin frame; no name)
// ---------------------------------------------------------------------------

// Might heroes mirror the fuyuki might portrait (bin), the magic hero the fuyuki
// magic portrait (aoko) — both 1086x1448.
const EXISTING_HEROES = [
  { id: "enterprise", ref: "enterprise", mirror: "anime/heroes/bin.png" },
  { id: "bismarck", ref: "bismarck", mirror: "anime/heroes/bin.png" },
  { id: "akashi", ref: "akashi", mirror: "anime/heroes/aoko.png" }
];

// Nagato ("Big Seven Flagship") + Sirius ("Royal Maid Gunner") — new hero
// portraits promoted from the cancelled class cards; mirror the might portrait.
const NEW_HEROES = [
  { id: "nagato", ref: "nagato", mirror: "anime/heroes/bin.png" },
  { id: "sirius", ref: "sirius", mirror: "anime/heroes/bin.png" }
];

function heroBgSvg(W, H) {
  const short = Math.min(W, H);
  const m = short * 0.02;
  const gw = short * 0.01;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="hsea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1a4778"/>
      <stop offset="0.55" stop-color="#0f2c50"/>
      <stop offset="1" stop-color="#081a30"/>
    </linearGradient>
    <radialGradient id="hglow" cx="0.5" cy="0.42" r="0.62">
      <stop offset="0" stop-color="#3d7fc4" stop-opacity="0.8"/>
      <stop offset="0.6" stop-color="#1a4a82" stop-opacity="0.32"/>
      <stop offset="1" stop-color="#081a30" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#hsea)"/>
  <ellipse cx="${f1(W / 2)}" cy="${f1(H * 0.46)}" rx="${f1(W * 0.46)}" ry="${f1(H * 0.44)}" fill="url(#hglow)"/>
</svg>`;
}

function heroFrameSvg(W, H) {
  const short = Math.min(W, H);
  const m = short * 0.02;
  const gw = short * 0.008;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect x="${f1(m)}" y="${f1(m)}" width="${f1(W - 2 * m)}" height="${f1(H - 2 * m)}" rx="${f1(short * 0.02)}" fill="none" stroke="#d9b45a" stroke-width="${f2(
    gw
  )}"/>
  <rect x="${f1(m + gw * 1.4)}" y="${f1(m + gw * 1.4)}" width="${f1(W - 2 * (m + gw * 1.4))}" height="${f1(
    H - 2 * (m + gw * 1.4)
  )}" rx="${f1(short * 0.016)}" fill="none" stroke="#eef4ff" stroke-width="${f2(gw * 0.55)}" opacity="0.8"/>
</svg>`;
}

async function renderHero(hero) {
  const outRel = `anime/heroes/${hero.id}.png`;
  const { width: W, height: H } = await mirrorMeta(hero.mirror);
  const bg = await svgRaster(heroBgSvg(W, H), W, H);
  const chars = await characterLayers(W, H, {
    primary: hero.ref,
    box: { bottom: 0.985, heightFrac: 0.93, maxWidthFrac: 1.15, hardMaxWidthFrac: 0.95 }
  });
  const frame = await svgRaster(heroFrameSvg(W, H), W, H);
  await finalizePng(sharp(bg).composite([...chars, { input: frame, left: 0, top: 0 }]), outRel, { width: W, height: H });
}

// ---------------------------------------------------------------------------
// commander card (Belfast) — unit-card language with a violet-gold trim
// ---------------------------------------------------------------------------

function commanderBgSvg(W, H) {
  let wake = "";
  for (let i = 0; i < 5; i++) {
    wake += `<ellipse cx="${f1(W / 2)}" cy="${f1(H * 0.9)}" rx="${f1(W * (0.22 + i * 0.12))}" ry="${f1(
      H * (0.16 + i * 0.045)
    )}" fill="none" stroke="#d9c7ff" stroke-width="${f2(W * 0.004)}" opacity="${f2(0.12 - i * 0.015)}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="csea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#26305f"/>
      <stop offset="0.5" stop-color="#141a3c"/>
      <stop offset="1" stop-color="#0a0f24"/>
    </linearGradient>
    <radialGradient id="cglow" cx="0.5" cy="0.44" r="0.6">
      <stop offset="0" stop-color="#6a5fc0" stop-opacity="0.8"/>
      <stop offset="0.55" stop-color="#33306e" stop-opacity="0.4"/>
      <stop offset="1" stop-color="#0a0f24" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#csea)"/>
  <ellipse cx="${f1(W / 2)}" cy="${f1(H * 0.47)}" rx="${f1(W * 0.44)}" ry="${f1(H * 0.42)}" fill="url(#cglow)"/>
  ${wake}
</svg>`;
}

function commanderFgSvg(W, H, name, subtitle) {
  const short = Math.min(W, H);
  const m = short * 0.02;
  const gw = short * 0.012;
  const wIn = short * 0.006;

  const bandX = W * 0.07;
  const bandY = H * 0.04;
  const bandW = W * 0.86;
  const bandH = H * 0.135;

  const nameLay = layoutBandTitle(name, bandW * 0.7, bandH * 0.5, 1);
  const nameSvg = titleTextSvg(nameLay.lines, W / 2, bandY + bandH * 0.38, nameLay.fontSize, nameLay.lineH, "#1a1440");
  const subFs = bandH * 0.2;
  const subSvg = `<text x="${f1(W / 2)}" y="${f1(bandY + bandH * 0.82)}" font-family="DejaVu Sans, sans-serif" font-weight="700" font-size="${f1(
    subFs
  )}" fill="#3a2a06" text-anchor="middle" style="letter-spacing:${f2(subFs * 0.12)}px">${esc(subtitle)}</text>`;

  // corner star (like the classic commander card)
  const sx = W * 0.87;
  const sy = H * 0.09;
  const sr = short * 0.03;
  let star = "";
  {
    const pts = [];
    for (let k = 0; k < 10; k++) {
      const a = (-90 + k * 36) * (Math.PI / 180);
      const rr = k % 2 === 0 ? sr : sr * 0.45;
      pts.push(`${f1(sx + rr * Math.cos(a))},${f1(sy + rr * Math.sin(a))}`);
    }
    star = `<polygon points="${pts.join(" ")}" fill="#e7b73c" stroke="#6a4bb0" stroke-width="${f2(short * 0.003)}"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="cband" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#c9b7ff"/>
      <stop offset="1" stop-color="#e7b73c"/>
    </linearGradient>
  </defs>
  <rect x="${f1(m)}" y="${f1(m)}" width="${f1(W - 2 * m)}" height="${f1(H - 2 * m)}" rx="${f1(short * 0.03)}" fill="none" stroke="#e7b73c" stroke-width="${f2(
    gw
  )}"/>
  <rect x="${f1(m + gw)}" y="${f1(m + gw)}" width="${f1(W - 2 * (m + gw))}" height="${f1(H - 2 * (m + gw))}" rx="${f1(
    short * 0.026
  )}" fill="none" stroke="#8f7fe0" stroke-width="${f2(wIn)}" opacity="0.9"/>
  <g>
    <rect x="${f1(bandX)}" y="${f1(bandY)}" width="${f1(bandW)}" height="${f1(bandH)}" rx="${f1(bandH * 0.16)}" fill="url(#cband)" stroke="#2a1f5a" stroke-width="${f2(
    short * 0.004
  )}"/>
    ${nameSvg}
    ${subSvg}
  </g>
  ${star}
  ${ribbonSvg(W, H, "COMMANDER", true)}
</svg>`;
}

async function renderCommander() {
  const outRel = "units-commander-belfast.webp";
  const { width: W, height: H } = await mirrorMeta("units-commander-sword_saint.webp");
  const bg = await svgRaster(commanderBgSvg(W, H), W, H);
  const chars = await characterLayers(W, H, {
    primary: "belfast",
    box: { bottom: 0.955, heightFrac: 0.8, maxWidthFrac: 1.0, hardMaxWidthFrac: 0.9 }
  });
  const fg = await svgRaster(commanderFgSvg(W, H, "BELFAST", "ROYAL MAID — COMMANDER"), W, H);
  await finalizeWebp(sharp(bg).composite([...chars, { input: fg, left: 0, top: 0 }]), outRel, { width: W, height: H }, { minKb: 50 });
}

// ---------------------------------------------------------------------------
// naval-base panorama (empty + full), the source for bars / tile / icon
// ---------------------------------------------------------------------------

function panoramaSvg(W, H, full) {
  const hz = Math.round(H * 0.54);
  const pierY = Math.round(H * 0.82);
  const sil = "#0a1a30";
  const sil2 = "#0d223c";

  // fixed skyline: [xFrac, wFrac, hFrac]
  const buildings = [
    [0.02, 0.1, 0.16], [0.13, 0.055, 0.1], [0.2, 0.09, 0.21], [0.3, 0.05, 0.12],
    [0.37, 0.12, 0.26], [0.5, 0.065, 0.14], [0.58, 0.1, 0.2], [0.69, 0.055, 0.11],
    [0.75, 0.12, 0.24], [0.88, 0.08, 0.15]
  ];
  let skyline = "";
  for (const [xf, wf, hf] of buildings) {
    const bx = W * xf;
    const bw = W * wf;
    const bh = H * hf;
    const by = hz - bh;
    skyline += `<rect x="${f1(bx)}" y="${f1(by)}" width="${f1(bw)}" height="${f1(bh + H * 0.02)}" fill="${sil}"/>`;
    skyline += `<rect x="${f1(bx)}" y="${f1(by)}" width="${f1(bw)}" height="${f1(H * 0.006)}" fill="#22436e" opacity="0.7"/>`;
    if (full) {
      // lit windows grid
      const cols = Math.max(2, Math.round(bw / (W * 0.02)));
      const rows = Math.max(2, Math.round(bh / (H * 0.05)));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if ((r + c) % 2 === 0) continue;
          const wx = bx + bw * ((c + 0.5) / cols);
          const wy = by + bh * ((r + 0.5) / rows);
          skyline += `<rect x="${f1(wx - W * 0.004)}" y="${f1(wy - H * 0.008)}" width="${f1(W * 0.008)}" height="${f1(
            H * 0.014
          )}" fill="#ffd67a" opacity="0.9"/>`;
        }
      }
    }
  }

  // gantry cranes
  const craneX = full ? [0.26, 0.46, 0.64, 0.82] : [0.32, 0.66];
  let cranes = "";
  for (const cf of craneX) {
    const cx = W * cf;
    const topY = hz - H * 0.2;
    const jib = W * 0.09;
    cranes += `<g stroke="${sil2}" stroke-width="${f2(W * 0.004)}" fill="none" opacity="0.95">
      <line x1="${f1(cx)}" y1="${f1(hz)}" x2="${f1(cx)}" y2="${f1(topY)}"/>
      <line x1="${f1(cx - jib * 0.3)}" y1="${f1(topY)}" x2="${f1(cx + jib)}" y2="${f1(topY)}"/>
      <line x1="${f1(cx)}" y1="${f1(topY + H * 0.02)}" x2="${f1(cx + jib)}" y2="${f1(topY)}"/>
      <line x1="${f1(cx + jib)}" y1="${f1(topY)}" x2="${f1(cx + jib)}" y2="${f1(topY + H * 0.05)}"/>
    </g>`;
  }

  // lighthouse near the right
  const lhX = W * 0.83;
  const lhTop = hz - H * 0.3;
  let lighthouse = `<polygon points="${f1(lhX - W * 0.018)},${f1(hz)} ${f1(lhX + W * 0.018)},${f1(hz)} ${f1(lhX + W * 0.011)},${f1(
    lhTop
  )} ${f1(lhX - W * 0.011)},${f1(lhTop)}" fill="${sil}"/>
    <rect x="${f1(lhX - W * 0.014)}" y="${f1(lhTop - H * 0.02)}" width="${f1(W * 0.028)}" height="${f1(H * 0.02)}" fill="${
    full ? "#ffcf5c" : "#2a3a55"
  }"/>`;
  if (full) {
    lighthouse += `<polygon points="${f1(lhX)},${f1(lhTop - H * 0.01)} ${f1(W * 0.98)},${f1(lhTop - H * 0.09)} ${f1(W * 0.98)},${f1(
      lhTop + H * 0.07
    )}" fill="#ffcf5c" opacity="0.16"/>`;
  }

  // dawn glow + warm dock lamps (full)
  let lamps = "";
  if (full) {
    for (const lf of [0.18, 0.4, 0.6, 0.78]) {
      lamps += `<circle cx="${f1(W * lf)}" cy="${f1(pierY - H * 0.02)}" r="${f1(H * 0.05)}" fill="#ffcf7a" opacity="0.12"/>`;
      lamps += `<circle cx="${f1(W * lf)}" cy="${f1(pierY - H * 0.02)}" r="${f1(H * 0.006)}" fill="#ffe6a8"/>`;
    }
  }

  // starfield (dawn sky) — deterministic scatter
  const rStar = mulberry(1337);
  let stars = "";
  for (let i = 0; i < 300; i++) {
    const x = rStar() * W;
    const y = rStar() * hz * 0.94;
    const r = 0.4 + rStar() * 1.3;
    const op = 0.2 + rStar() * 0.55;
    stars += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f2(r)}" fill="#eaf3ff" opacity="${f2(op)}"/>`;
  }

  // water shimmer — short bright strokes, brighter near the dawn reflection
  const rShim = mulberry(9001);
  let shimmer = "";
  for (let i = 0; i < 260; i++) {
    const x = rShim() * W;
    const y = hz + rShim() * (H - hz) * 0.95;
    const len = 2 + rShim() * W * 0.024;
    const dist = Math.abs(x - W * 0.72) / W;
    const op = Math.max(0.05, (0.55 - dist) * (full ? 0.6 : 0.4));
    shimmer += `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(len)}" height="${f2(H * 0.0022)}" rx="${f2(
      H * 0.0011
    )}" fill="#bfe0ff" opacity="${f2(op)}"/>`;
  }

  // distant ship silhouettes on the horizon (both variants)
  let ships = "";
  for (const [sf, scale] of [[0.08, 0.9], [0.31, 0.7], [0.56, 0.6], [0.92, 0.8]]) {
    const sx = W * sf;
    const sy = hz + H * 0.015;
    const hw = W * 0.03 * scale;
    const hh = H * 0.02 * scale;
    ships += `<g opacity="0.9">
      <polygon points="${f1(sx - hw)},${f1(sy)} ${f1(sx + hw)},${f1(sy)} ${f1(sx + hw * 0.6)},${f1(sy + hh)} ${f1(
      sx - hw * 0.6
    )},${f1(sy + hh)}" fill="#0a1a30"/>
      <rect x="${f1(sx - hw * 0.05)}" y="${f1(sy - hh * 1.6)}" width="${f1(hw * 0.1)}" height="${f1(hh * 1.6)}" fill="#0a1a30"/>
      ${full ? `<rect x="${f1(sx - hw * 0.5)}" y="${f1(sy - hh * 0.4)}" width="${f1(hw * 0.12)}" height="${f1(hh * 0.4)}" fill="#ffd67a"/>` : ""}
    </g>`;
  }

  // sea wake lines
  let waves = "";
  const nWaves = 11;
  for (let i = 0; i < nWaves; i++) {
    const wy = hz + (H - hz) * ((i + 1) / (nWaves + 1));
    const amp = H * 0.006 * (1 + i * 0.1);
    waves += `<path d="M 0 ${f1(wy)} Q ${f1(W * 0.25)} ${f1(wy - amp)} ${f1(W * 0.5)} ${f1(wy)} T ${f1(W)} ${f1(
      wy
    )}" fill="none" stroke="#5fa8de" stroke-width="${f2(H * 0.0025)}" opacity="${f2(0.1 + i * 0.012)}"/>`;
  }

  // foreground pier
  const pier = `<rect x="0" y="${f1(pierY)}" width="${W}" height="${f1(H - pierY)}" fill="#0b1526"/>
    <rect x="0" y="${f1(pierY)}" width="${W}" height="${f1(H * 0.01)}" fill="#1b3151"/>`;
  let posts = "";
  for (let i = 0; i <= 16; i++) {
    const px = W * (i / 16);
    posts += `<rect x="${f1(px - W * 0.004)}" y="${f1(pierY)}" width="${f1(W * 0.008)}" height="${f1(H * 0.03)}" fill="#13294a"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2a5c8f"/>
      <stop offset="0.4" stop-color="#1c4472"/>
      <stop offset="0.75" stop-color="#122f52"/>
      <stop offset="1" stop-color="#0c223c"/>
    </linearGradient>
    <linearGradient id="sea2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#123354"/>
      <stop offset="1" stop-color="#081726"/>
    </linearGradient>
    <radialGradient id="dawn" cx="0.72" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#f6c98a" stop-opacity="${full ? 0.5 : 0.32}"/>
      <stop offset="1" stop-color="#f6c98a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="${W}" height="${f1(hz)}" fill="url(#sky)"/>
  ${stars}
  <ellipse cx="${f1(W * 0.72)}" cy="${f1(hz * 0.66)}" rx="${f1(W * 0.34)}" ry="${f1(hz * 0.6)}" fill="url(#dawn)"/>
  <circle cx="${f1(W * 0.72)}" cy="${f1(hz * 0.42)}" r="${f1(H * (full ? 0.05 : 0.045))}" fill="#ffe6b0" opacity="${full ? 0.9 : 0.6}"/>
  <rect x="0" y="${f1(hz)}" width="${W}" height="${f1(H - hz)}" fill="url(#sea2)"/>
  <ellipse cx="${f1(W * 0.72)}" cy="${f1(hz)}" rx="${f1(W * 0.14)}" ry="${f1(H * 0.12)}" fill="#ffdca0" opacity="${full ? 0.14 : 0.08}"/>
  ${ships}
  ${skyline}
  ${cranes}
  ${lighthouse}
  ${waves}
  ${shimmer}
  ${lamps}
  ${pier}
  ${posts}
</svg>`;
}

// characters for the FULL panorama pier lineup (refs, left->right)
const PANORAMA_LINEUP = ["destroyer-flotilla-few", "belfast", "enterprise", "bismarck", "light-cruisers-few"];

async function buildPanoramas() {
  const { width: W, height: H } = await mirrorMeta("anime/towns/azure-breeze-sect-full.webp");

  const emptyBg = await applyGrain(await svgRaster(panoramaSvg(W, H, false), W, H), W, H);
  await finalizeWebp(sharp(emptyBg), "anime/towns/azur-lane-base-empty.webp", { width: W, height: H }, { minKb: 50, quality: 92 });

  const fullBgOnly = await applyGrain(await svgRaster(panoramaSvg(W, H, true), W, H), W, H);
  // pier lineup: scale each character to ~34% of H, anchored on the pier
  const pierBottom = Math.round(H * 0.92);
  const targetH = Math.round(H * 0.34);
  const n = PANORAMA_LINEUP.length;
  const layers = [];
  for (let i = 0; i < n; i++) {
    const ref = PANORAMA_LINEUP[i];
    const buf = await sharp(await loadRefBuf(ref)).resize({ height: targetH }).png().toBuffer();
    const cm = await sharp(buf).metadata();
    const centerX = Math.round(W * (0.11 + (0.78 * i) / (n - 1)));
    layers.push({ input: buf, left: Math.max(0, Math.min(W - cm.width, centerX - Math.round(cm.width / 2))), top: pierBottom - cm.height });
  }
  const fullBuf = await sharp(fullBgOnly).composite(layers).png().toBuffer();
  await finalizeWebp(sharp(fullBuf), "anime/towns/azur-lane-base-full.webp", { width: W, height: H }, { minKb: 50, quality: 92 });

  return { fullBuf, emptyBuf: emptyBg, W, H };
}

// ---------------------------------------------------------------------------
// town-board bars — contiguous slices of the FULL panorama
// ---------------------------------------------------------------------------

async function buildBars(fullBuf) {
  let x = 0;
  for (let n = 1; n <= 7; n++) {
    const { width: bw, height: bh } = await mirrorMeta(`town-board/azure-breeze-bar-${n}.webp`);
    await finalizeWebp(
      sharp(fullBuf).extract({ left: x, top: 0, width: bw, height: bh }),
      `town-board/azur-lane-bar-${n}.webp`,
      { width: bw, height: bh }
    );
    x += bw;
  }
}

// ---------------------------------------------------------------------------
// starting tile p-s1 — naval hex-flower over a clipped panorama underlay
// ---------------------------------------------------------------------------

function hexPoints(cx, cy, R) {
  const pts = [];
  for (let k = 0; k < 6; k++) {
    const a = (30 + 60 * k) * (Math.PI / 180);
    pts.push(`${f1(cx + R * Math.cos(a))},${f1(cy - R * Math.sin(a))}`);
  }
  return pts.join(" ");
}

function flowerCenters(cx, cy, R) {
  const s3 = Math.sqrt(3);
  return {
    center: [cx, cy],
    E: [cx + s3 * R, cy],
    W: [cx - s3 * R, cy],
    NE: [cx + (s3 / 2) * R, cy - 1.5 * R],
    NW: [cx - (s3 / 2) * R, cy - 1.5 * R],
    SE: [cx + (s3 / 2) * R, cy + 1.5 * R],
    SW: [cx - (s3 / 2) * R, cy + 1.5 * R]
  };
}

function flowerMaskSvg(W, H, C, R) {
  const hexes = Object.values(C).map(([x, y]) => `<polygon points="${hexPoints(x, y, R)}" fill="#fff"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${hexes}</svg>`;
}

// glyph builders (each fits within a hex of radius R centred at cx,cy)
function labelBadge(x, y, text, s) {
  return `<text x="${f1(x)}" y="${f1(y)}" font-family="DejaVu Sans, sans-serif" font-weight="700" font-size="${f1(
    s
  )}" fill="#fff5df" stroke="#0a1424" stroke-width="${f2(s * 0.12)}" paint-order="stroke" text-anchor="middle">${esc(text)}</text>`;
}
function resourceGlyph(cx, cy, s) {
  return `<g stroke="#0a1424" stroke-width="${f2(s * 0.08)}">
    <circle cx="${f1(cx)}" cy="${f1(cy - s * 0.5)}" r="${f1(s * 0.4)}" fill="#7fe0d0"/>
    <circle cx="${f1(cx - s * 0.5)}" cy="${f1(cy + s * 0.35)}" r="${f1(s * 0.4)}" fill="#7fe0d0"/>
    <circle cx="${f1(cx + s * 0.5)}" cy="${f1(cy + s * 0.35)}" r="${f1(s * 0.4)}" fill="#7fe0d0"/>
  </g>`;
}
function glyphCampfire(cx, cy, R) {
  const s = R * 0.4;
  return `<g>
    <g stroke="#3a2412" stroke-width="${f2(s * 0.16)}" stroke-linecap="round">
      <line x1="${f1(cx - s * 0.7)}" y1="${f1(cy + s * 0.7)}" x2="${f1(cx + s * 0.7)}" y2="${f1(cy + s * 0.5)}"/>
      <line x1="${f1(cx - s * 0.7)}" y1="${f1(cy + s * 0.5)}" x2="${f1(cx + s * 0.7)}" y2="${f1(cy + s * 0.7)}"/>
    </g>
    <path d="M ${f1(cx)} ${f1(cy - s)} C ${f1(cx + s * 0.9)} ${f1(cy - s * 0.1)} ${f1(cx + s * 0.5)} ${f1(cy + s * 0.6)} ${f1(cx)} ${f1(
    cy + s * 0.55
  )} C ${f1(cx - s * 0.5)} ${f1(cy + s * 0.6)} ${f1(cx - s * 0.9)} ${f1(cy - s * 0.1)} ${f1(cx)} ${f1(cy - s)} Z" fill="#ff8c2e"/>
    <path d="M ${f1(cx)} ${f1(cy - s * 0.5)} C ${f1(cx + s * 0.45)} ${f1(cy + s * 0.05)} ${f1(cx + s * 0.25)} ${f1(cy + s * 0.5)} ${f1(
    cx
  )} ${f1(cy + s * 0.45)} C ${f1(cx - s * 0.25)} ${f1(cy + s * 0.5)} ${f1(cx - s * 0.45)} ${f1(cy + s * 0.05)} ${f1(cx)} ${f1(
    cy - s * 0.5
  )} Z" fill="#ffd75e"/>
  </g>
  <g transform="translate(${f1(cx + R * 0.52)},${f1(cy - R * 0.4)}) rotate(40)" stroke="#e9eef6" stroke-width="${f2(
    R * 0.045
  )}" fill="none" stroke-linecap="round">
    <line x1="0" y1="${f1(-R * 0.3)}" x2="0" y2="${f1(R * 0.3)}"/>
    <path d="M ${f1(-R * 0.24)} ${f1(-R * 0.3)} Q 0 ${f1(-R * 0.48)} ${f1(R * 0.24)} ${f1(-R * 0.3)}"/>
  </g>`;
}
function glyphRocks(cx, cy, R) {
  const rk = (x, y, w, h) =>
    `<polygon points="${f1(x - w)},${f1(y + h)} ${f1(x - w * 0.5)},${f1(y - h)} ${f1(x + w * 0.4)},${f1(y - h * 0.6)} ${f1(
      x + w
    )},${f1(y + h)}" fill="#59626f" stroke="#2b323d" stroke-width="${f2(R * 0.03)}"/>`;
  return `<g opacity="0.96">
    <ellipse cx="${f1(cx)}" cy="${f1(cy + R * 0.55)}" rx="${f1(R * 0.85)}" ry="${f1(R * 0.28)}" fill="#3d4550"/>
    ${rk(cx - R * 0.4, cy + R * 0.2, R * 0.4, R * 0.5)}
    ${rk(cx + R * 0.42, cy + R * 0.25, R * 0.42, R * 0.45)}
    ${rk(cx, cy - R * 0.1, R * 0.5, R * 0.6)}
  </g>`;
}
function glyphTreasure(cx, cy, R) {
  const s = R * 0.5;
  return `<g>
    <ellipse cx="${f1(cx - s * 1.1)}" cy="${f1(cy + s * 0.7)}" rx="${f1(s * 0.3)}" ry="${f1(s * 0.16)}" fill="#ffd75e" stroke="#0a1424" stroke-width="${f2(
    s * 0.06
  )}"/>
    <ellipse cx="${f1(cx + s * 1.15)}" cy="${f1(cy + s * 0.75)}" rx="${f1(s * 0.26)}" ry="${f1(s * 0.14)}" fill="#ffd75e" stroke="#0a1424" stroke-width="${f2(
    s * 0.06
  )}"/>
    <rect x="${f1(cx - s)}" y="${f1(cy - s * 0.1)}" width="${f1(s * 2)}" height="${f1(s * 0.95)}" rx="${f1(s * 0.1)}" fill="#8a5a2b" stroke="#0a1424" stroke-width="${f2(
    s * 0.08
  )}"/>
    <path d="M ${f1(cx - s)} ${f1(cy)} Q ${f1(cx)} ${f1(cy - s * 0.85)} ${f1(cx + s)} ${f1(cy)} Z" fill="#a06a34" stroke="#0a1424" stroke-width="${f2(
    s * 0.08
  )}"/>
    <rect x="${f1(cx - s * 1.02)}" y="${f1(cy - s * 0.05)}" width="${f1(s * 2.04)}" height="${f1(s * 0.18)}" fill="#c98a3e"/>
    <rect x="${f1(cx - s * 0.16)}" y="${f1(cy - s * 0.05)}" width="${f1(s * 0.32)}" height="${f1(s * 0.5)}" fill="#ffd75e" stroke="#0a1424" stroke-width="${f2(
    s * 0.06
  )}"/>
  </g>
  ${labelBadge(cx + R * 0.7, cy - R * 0.5, "I", R * 0.42)}`;
}
function glyphMine(cx, cy, R) {
  const s = R * 0.52;
  return `<g>
    <rect x="${f1(cx - s * 1.1)}" y="${f1(cy - s * 0.2)}" width="${f1(s * 2.2)}" height="${f1(s * 1.1)}" fill="#2c4e78" stroke="#0a1424" stroke-width="${f2(
    s * 0.08
  )}"/>
    <polygon points="${f1(cx - s * 1.25)},${f1(cy - s * 0.2)} ${f1(cx)},${f1(cy - s * 0.95)} ${f1(cx + s * 1.25)},${f1(
    cy - s * 0.2
  )}" fill="#3a628f" stroke="#0a1424" stroke-width="${f2(s * 0.08)}"/>
    <rect x="${f1(cx - s * 0.28)}" y="${f1(cy + s * 0.2)}" width="${f1(s * 0.56)}" height="${f1(s * 0.7)}" fill="#0b1a2c"/>
    <rect x="${f1(cx + s * 0.55)}" y="${f1(cy - s * 0.05)}" width="${f1(s * 0.16)}" height="${f1(s * 0.4)}" fill="#ffd67a"/>
  </g>
  ${resourceGlyph(cx - R * 0.55, cy + R * 0.72, R * 0.16)}
  <g transform="translate(${f1(cx + R * 0.2)},${f1(cy + R * 0.72)})" stroke="#fff5df" stroke-width="${f2(R * 0.05)}" fill="none">
    <path d="M ${f1(-R * 0.22)} ${f1(-R * 0.02)} A ${f1(R * 0.22)} ${f1(R * 0.22)} 0 1 1 ${f1(-R * 0.14)} ${f1(R * 0.18)}"/>
    <polygon points="${f1(-R * 0.22)},${f1(-R * 0.14)} ${f1(-R * 0.1)},${f1(-R * 0.04)} ${f1(-R * 0.26)},${f1(R * 0.02)}" fill="#fff5df" stroke="none"/>
  </g>
  ${labelBadge(cx + R * 0.5, cy + R * 0.8, "2", R * 0.3)}
  ${labelBadge(cx + R * 0.62, cy - R * 0.62, "I", R * 0.42)}`;
}
function glyphHarbor(cx, cy, R, flip) {
  const dir = flip ? -1 : 1;
  return `<g opacity="0.95">
    <rect x="${f1(cx - R * 0.75)}" y="${f1(cy + R * 0.35)}" width="${f1(R * 1.5)}" height="${f1(R * 0.16)}" fill="#12385c"/>
    <g transform="translate(${f1(cx)},${f1(cy - R * 0.1)})">
      <polygon points="${f1(-R * 0.55 * dir)},${f1(R * 0.2)} ${f1(R * 0.6 * dir)},${f1(R * 0.2)} ${f1(R * 0.42 * dir)},${f1(
    R * 0.42
  )} ${f1(-R * 0.42 * dir)},${f1(R * 0.42)}" fill="#16273f" stroke="#0a1424" stroke-width="${f2(R * 0.03)}"/>
      <rect x="${f1(-R * 0.05 * dir - R * 0.03)}" y="${f1(-R * 0.5)}" width="${f1(R * 0.06)}" height="${f1(R * 0.7)}" fill="#0a1424"/>
      <polygon points="${f1(R * 0.01 * dir)},${f1(-R * 0.5)} ${f1(R * 0.45 * dir)},${f1(-R * 0.2)} ${f1(R * 0.01 * dir)},${f1(
    -R * 0.05
  )}" fill="#e9eef6" opacity="0.85"/>
    </g>
  </g>`;
}
function townMotif(cx, cy, R) {
  const win = (x, y) => `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(R * 0.045)}" height="${f1(R * 0.07)}" fill="#ffd67a"/>`;
  let windows = "";
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      if ((r + c) % 2 === 0) windows += win(cx - R * 0.42 + c * R * 0.2, cy - R * 0.1 + r * R * 0.18);
    }
  }
  const tower = (x, w, h) =>
    `<rect x="${f1(x - w / 2)}" y="${f1(cy + R * 0.7 - h)}" width="${f1(w)}" height="${f1(h)}" fill="#0c1e36" stroke="#08131f" stroke-width="${f2(
      R * 0.02
    )}"/><polygon points="${f1(x - w * 0.62)},${f1(cy + R * 0.7 - h)} ${f1(x)},${f1(cy + R * 0.7 - h - w * 0.6)} ${f1(
      x + w * 0.62
    )},${f1(cy + R * 0.7 - h)}" fill="#123a52"/>`;
  return `<g>
    <rect x="${f1(cx - R * 0.9)}" y="${f1(cy + R * 0.55)}" width="${f1(R * 1.8)}" height="${f1(R * 0.28)}" fill="#0a1728"/>
    ${tower(cx - R * 0.62, R * 0.34, R * 0.75)}
    ${tower(cx + R * 0.62, R * 0.34, R * 0.75)}
    <rect x="${f1(cx - R * 0.5)}" y="${f1(cy - R * 0.35)}" width="${f1(R)}" height="${f1(R * 1.05)}" fill="#0c2038" stroke="#08131f" stroke-width="${f2(
    R * 0.02
  )}"/>
    <polygon points="${f1(cx - R * 0.58)},${f1(cy - R * 0.35)} ${f1(cx)},${f1(cy - R * 0.95)} ${f1(cx + R * 0.58)},${f1(
    cy - R * 0.35
  )}" fill="#12395f"/>
    ${windows}
    <rect x="${f1(cx - R * 0.16)}" y="${f1(cy + R * 0.32)}" width="${f1(R * 0.32)}" height="${f1(R * 0.38)}" rx="${f1(
    R * 0.14
  )}" fill="#08131f"/>
    ${anchorSvg(cx, cy + R * 0.5, R * 0.14, "#7fb0e0")}
    <circle cx="${f1(cx)}" cy="${f1(cy - R * 1.02)}" r="${f1(R * 0.11)}" fill="#8fe6ff"/>
    <circle cx="${f1(cx)}" cy="${f1(cy - R * 1.02)}" r="${f1(R * 0.2)}" fill="#8fe6ff" opacity="0.28"/>
  </g>`;
}

function tileOverlaySvg(W, H, C, R) {
  const tint = Object.values(C).map(([x, y]) => `<polygon points="${hexPoints(x, y, R)}" fill="#0a1a30" opacity="0.24"/>`).join("");
  // beveled tan borders: dark casing then tan core
  const casing = Object.values(C)
    .map(([x, y]) => `<polygon points="${hexPoints(x, y, R)}" fill="none" stroke="#3a2f1c" stroke-width="${f2(R * 0.075)}"/>`)
    .join("");
  const core = Object.values(C)
    .map(([x, y]) => `<polygon points="${hexPoints(x, y, R)}" fill="none" stroke="#d9c9a3" stroke-width="${f2(R * 0.045)}" stroke-linejoin="round"/>`)
    .join("");

  const glyphs = `
    ${townMotif(C.center[0], C.center[1], R)}
    ${glyphCampfire(C.NE[0], C.NE[1], R)}
    ${glyphRocks(C.E[0], C.E[1], R)}
    ${glyphHarbor(C.SE[0], C.SE[1], R, true)}
    ${glyphTreasure(C.SW[0], C.SW[1] + R * 0.05, R)}
    ${glyphMine(C.W[0], C.W[1], R)}
    ${glyphHarbor(C.NW[0], C.NW[1], R, false)}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${tint}
    ${glyphs}
    ${casing}
    ${core}
  </svg>`;
}

async function buildTile(underlayBuf) {
  const outRel = "anime/tiles/p-s1.webp";
  const { width: W, height: H } = await mirrorMeta("anime/tiles/a-s1.webp");
  const R = 190;
  const C = flowerCenters(W / 2, Math.round(H * 0.5), R);

  // Underlay is the CHARACTER-FREE harbor scene so hexes read as clean sea/port
  // texture (no cropped shipgirls bleeding into the water hexes).
  const scene = await sharp(underlayBuf).resize(W, H, { fit: "cover" }).modulate({ brightness: 0.92 }).png().toBuffer();
  const mask = await svgRaster(flowerMaskSvg(W, H, C, R), W, H);
  const clipped = await sharp(scene).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  const overlay = await svgRaster(tileOverlaySvg(W, H, C, R), W, H);

  await finalizeWebp(sharp(clipped).composite([{ input: overlay, left: 0, top: 0 }]), outRel, { width: W, height: H }, { minKb: 60, quality: 92 });
}

// ---------------------------------------------------------------------------
// town icon — crop a distinctive citadel window from the FULL panorama
// ---------------------------------------------------------------------------

async function buildIcon(fullBuf) {
  const outRel = "town-icon-azur_lane.webp";
  const { width: iw, height: ih } = await mirrorMeta("town-icon-azure_breeze.webp");
  const { width: W, height: H } = await sharp(fullBuf).metadata();
  const cropW = Math.min(W, Math.round(H * (iw / ih)));
  const left = Math.min(Math.max(0, Math.round(W * 0.3)), W - cropW);
  await finalizeWebp(
    sharp(fullBuf).extract({ left, top: 0, width: cropW, height: H }).resize(iw, ih, { fit: "fill" }),
    outRel,
    { width: iw, height: ih }
  );
}

// ---------------------------------------------------------------------------

// Sections let a run touch only part of the suite (a parallel job reads these
// exact paths, so we avoid rewriting untouched outputs). No args = full build
// (the script is the source of truth for the whole suite):
//   units        the 14 named-shipgirl unit cards
//   heroes       the 3 existing hero portraits (enterprise/bismarck/akashi)
//   heroes-new   the 2 new hero portraits (nagato/sirius)
//   commander    the Belfast commander card
//   scenery      panoramas + board bars + tile + town icon
async function main() {
  const args = process.argv.slice(2);
  const runAll = args.length === 0;
  const want = (name) => runAll || args.includes(name);

  if (want("units")) {
    for (const u of UNITS) {
      for (const side of ["few", "pack"]) await renderUnitCard(u, side);
    }
  }
  if (want("heroes")) for (const hero of EXISTING_HEROES) await renderHero(hero);
  if (want("heroes-new")) for (const hero of NEW_HEROES) await renderHero(hero);
  if (want("commander")) await renderCommander();
  if (want("scenery")) {
    const { fullBuf, emptyBuf } = await buildPanoramas();
    await buildBars(fullBuf);
    await buildTile(emptyBuf);
    await buildIcon(fullBuf);
  }

  console.log("\nGenerated Azur Lane art:");
  console.log("  " + "path".padEnd(62) + "dims".padEnd(12) + "bytes");
  for (const r of TABLE) console.log("  " + r.path.padEnd(62) + r.dims.padEnd(12) + r.bytes);
  console.log(`\n${TABLE.length} files written.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

#!/usr/bin/env node

// Azur Lane (`azur_lane`) production art compositor — 2026-07 REAL-ART upgrade.
// The old procedural SVG suite is retired: every output now composes a
// Codex-painted MASTER from scripts/anime-art/raw/azur-lane/** (generated with
// the desktop Codex CLI's image_gen, official wiki refs fed via -i — see the
// fetch step in fetch-azur-lane-art.mjs for the refs and
// build-azur-lane-unit-cards.mjs for the 14 unit-card faces + stat icons).
//
// Sections (args; no args = all):
//   scenery    panoramas (empty/full) + 7 board bars + P-S1 tile + town icon
//   heroes     the 5 hero portraits (enterprise/bismarck/nagato/akashi/sirius)
//   commander  the Belfast commander card
//   equipment  the 6 kansen equipment icons
//   icons      rank-ability icons (full-barrage / fleet-formation) + the
//              Royal Salvo cast icon
//
// Every output's pixel dimensions are read LIVE from its azure_breeze / anime
// twin with sharp.metadata() and re-asserted after write (repo convention).
// Deterministic + idempotent: re-running overwrites the same outputs.

import { statSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(root, "public", "assets");
const RAW = path.join(root, "scripts", "anime-art", "raw", "azur-lane");

const f1 = (n) => Number(n).toFixed(1);
const f2 = (n) => Number(n).toFixed(2);
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

async function mirrorMeta(rel) {
  // Buffer read: several outputs mirror THEIR OWN previous file's dims — a
  // path-based sharp input would hold a Windows file lock across the overwrite.
  const buf = await readFile(path.join(assets, rel));
  const m = await sharp(buf).metadata();
  if (!m.width || !m.height) throw new Error(`No dimensions for mirror source: ${rel}`);
  return { width: m.width, height: m.height };
}

async function svgRaster(svg, W, H) {
  return sharp(Buffer.from(svg)).resize(W, H, { fit: "fill" }).png().toBuffer();
}

const TABLE = [];
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
  TABLE.push({ path: path.relative(root, outPath), dims: `${m.width}x${m.height}`, bytes });
}
async function finalizeWebp(pipeline, outRel, expect, { minKb = 0, quality = 90 } = {}) {
  const outPath = path.join(assets, outRel);
  await mkdir(path.dirname(outPath), { recursive: true });
  await pipeline.webp({ quality, effort: 6 }).toFile(outPath);
  await verifyOut(outRel, expect, minKb);
}
const master = (rel) => path.join(RAW, rel);

/** Strip the flat #00ff00 chroma key a Codex icon master ships with. */
async function keyedIcon(src, size) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (g > 150 && g > r * 1.6 && g > b * 1.6) {
      data[i + 3] = 0;
    } else if (g > 100 && g > r * 1.25 && g > b * 1.25) {
      data[i + 1] = Math.round((r + b) / 2);
      data[i + 3] = Math.min(data[i + 3], 140);
    }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim({ threshold: 12 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

// ---------------------------------------------------------------------------
// scenery — panoramas, bars, tile, town icon
// ---------------------------------------------------------------------------

async function buildPanoramas() {
  const { width: W, height: H } = await mirrorMeta("anime/towns/azure-breeze-sect-full.webp");
  const emptyBuf = await sharp(master("scenery/panorama-empty.webp")).resize(W, H, { fit: "cover" }).png().toBuffer();
  const fullBuf = await sharp(master("scenery/panorama-full.webp")).resize(W, H, { fit: "cover" }).png().toBuffer();
  await finalizeWebp(sharp(emptyBuf), "anime/towns/azur-lane-base-empty.webp", { width: W, height: H }, { minKb: 50, quality: 92 });
  await finalizeWebp(sharp(fullBuf), "anime/towns/azur-lane-base-full.webp", { width: W, height: H }, { minKb: 50, quality: 92 });
  return { fullBuf, W, H };
}

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

// P-S1 hex-flower geometry (mirrors a-s1.webp: 1024x985, R=190).
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

/** Serif numeral badge (the printed tiles' gold "I" difficulty marks). */
function numeral(x, y, text, s) {
  return `<text x="${f1(x)}" y="${f1(y)}" font-family="DejaVu Serif, Georgia, serif" font-weight="700" font-size="${f1(
    s
  )}" fill="#ffd75e" stroke="#0a1424" stroke-width="${f2(s * 0.14)}" paint-order="stroke" text-anchor="middle">${esc(text)}</text>`;
}
/** Small white game symbols in the printed-tile language. */
function chestGlyph(cx, cy, s) {
  return `<g stroke="#fff5df" stroke-width="${f2(s * 0.12)}" fill="none" stroke-linejoin="round">
    <rect x="${f1(cx - s)}" y="${f1(cy - s * 0.45)}" width="${f1(s * 2)}" height="${f1(s * 1.15)}" rx="${f1(s * 0.14)}"/>
    <path d="M ${f1(cx - s)} ${f1(cy - s * 0.45)} Q ${f1(cx)} ${f1(cy - s * 1.15)} ${f1(cx + s)} ${f1(cy - s * 0.45)}"/>
    <rect x="${f1(cx - s * 0.18)}" y="${f1(cy - s * 0.35)}" width="${f1(s * 0.36)}" height="${f1(s * 0.5)}" fill="#fff5df" stroke="none"/>
  </g>`;
}
function pickShovelGlyph(cx, cy, s) {
  return `<g stroke="#fff5df" stroke-width="${f2(s * 0.13)}" fill="none" stroke-linecap="round">
    <line x1="${f1(cx - s * 0.7)}" y1="${f1(cy + s * 0.8)}" x2="${f1(cx + s * 0.6)}" y2="${f1(cy - s * 0.7)}"/>
    <path d="M ${f1(cx + s * 0.15)} ${f1(cy - s * 1.05)} Q ${f1(cx + s * 0.85)} ${f1(cy - s * 0.85)} ${f1(cx + s * 1.05)} ${f1(cy - s * 0.15)}"/>
    <line x1="${f1(cx + s * 0.8)}" y1="${f1(cy + s * 0.7)}" x2="${f1(cx - s * 0.35)}" y2="${f1(cy - s * 0.5)}"/>
    <path d="M ${f1(cx - s * 0.35)} ${f1(cy - s * 0.5)} l ${f1(-s * 0.42)} ${f1(-s * 0.28)} l ${f1(-s * 0.05)} ${f1(s * 0.5)} z" fill="#fff5df" stroke="none"/>
  </g>`;
}
function materialsGlyph(cx, cy, s) {
  const rock = (x, y, r) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="#e9eef6" stroke="#0a1424" stroke-width="${f2(r * 0.2)}"/>`;
  return `${rock(cx - s * 0.5, cy + s * 0.3, s * 0.42)}${rock(cx + s * 0.5, cy + s * 0.32, s * 0.4)}${rock(cx, cy - s * 0.3, s * 0.46)}`;
}
function revisitGlyph(cx, cy, s, count) {
  return `<g>
    <g stroke="#fff5df" stroke-width="${f2(s * 0.16)}" fill="none">
      <path d="M ${f1(cx - s * 0.6)} ${f1(cy)} A ${f1(s * 0.6)} ${f1(s * 0.6)} 0 1 1 ${f1(cx - s * 0.35)} ${f1(cy + s * 0.48)}"/>
    </g>
    <polygon points="${f1(cx - s * 0.62)},${f1(cy - s * 0.4)} ${f1(cx - s * 0.25)},${f1(cy - s * 0.1)} ${f1(cx - s * 0.72)},${f1(cy + s * 0.08)}" fill="#fff5df"/>
    ${numeral(cx + s * 1.2, cy + s * 0.4, String(count), s * 1.3)}
  </g>`;
}

/**
 * P-S1 symbol overlay — the SAME field roles as the printed S4 layout the tile
 * copies (fields: center town · NE resource symbol · E blocked · SE empty ·
 * SW treasure I · W materials mine I ×2 · NW empty), over the painted scene.
 */
function tileOverlaySvg(W, H, C, R) {
  const casing = Object.values(C)
    .map(([x, y]) => `<polygon points="${hexPoints(x, y, R)}" fill="none" stroke="#3a2f1c" stroke-width="${f2(R * 0.075)}"/>`)
    .join("");
  const core = Object.values(C)
    .map(([x, y]) => `<polygon points="${hexPoints(x, y, R)}" fill="none" stroke="#d9c9a3" stroke-width="${f2(R * 0.045)}" stroke-linejoin="round"/>`)
    .join("");

  const [nex, ney] = C.NE;
  const [swx, swy] = C.SW;
  const [wx, wy] = C.W;
  const glyphs = `
    ${pickShovelGlyph(nex + R * 0.42, ney - R * 0.42, R * 0.22)}
    ${chestGlyph(swx - R * 0.32, swy + R * 0.18, R * 0.2)}
    ${numeral(swx + R * 0.5, swy + R * 0.3, "I", R * 0.42)}
    ${numeral(wx + R * 0.5, wy - R * 0.55, "I", R * 0.42)}
    ${revisitGlyph(wx - R * 0.55, wy + R * 0.6, R * 0.18, 2)}
    ${materialsGlyph(wx + R * 0.25, wy + R * 0.62, R * 0.16)}
  `;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${glyphs}
    ${casing}
    ${core}
  </svg>`;
}

async function buildTile() {
  const outRel = "anime/tiles/p-s1.webp";
  const { width: W, height: H } = await mirrorMeta("anime/tiles/a-s1.webp");
  const R = 190;
  const C = flowerCenters(W / 2, Math.round(H * 0.5), R);

  const scene = await sharp(master("scenery/tile-scene.webp")).resize(W, H, { fit: "cover" }).png().toBuffer();
  const mask = await svgRaster(flowerMaskSvg(W, H, C, R), W, H);
  const clipped = await sharp(scene).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  const overlay = await svgRaster(tileOverlaySvg(W, H, C, R), W, H);
  await finalizeWebp(sharp(clipped).composite([{ input: overlay, left: 0, top: 0 }]), outRel, { width: W, height: H }, { minKb: 60, quality: 92 });
}

async function buildIcon(fullBuf, W, H) {
  const outRel = "town-icon-azur_lane.webp";
  const { width: iw, height: ih } = await mirrorMeta("town-icon-azure_breeze.webp");
  const cropW = Math.min(W, Math.round(H * (iw / ih)));
  // Zone 1 (the Command HQ) anchors the icon crop at the panorama's left.
  const left = Math.min(Math.max(0, Math.round(W * 0.0)), W - cropW);
  await finalizeWebp(
    sharp(fullBuf).extract({ left, top: 0, width: cropW, height: H }).resize(iw, ih, { fit: "fill" }),
    outRel,
    { width: iw, height: ih }
  );
}

// ---------------------------------------------------------------------------
// heroes — full-bleed painted portraits (cover-fit to the anime hero size)
// ---------------------------------------------------------------------------

const HEROES = ["enterprise", "bismarck", "nagato", "akashi", "sirius"];

async function buildHeroes() {
  // Hero portraits ship as WEBP repo-wide (the 2026-07 perf pass, 29.4MB →
  // 2.9MB) — mirror the Fuyuki webp twin and emit quality-90 webp.
  const { width: W, height: H } = await mirrorMeta("anime/heroes/bin.webp");
  for (const id of HEROES) {
    await finalizeWebp(
      sharp(master(`heroes/${id}.webp`)).resize(W, H, { fit: "cover", position: "attention" }),
      `anime/heroes/${id}.webp`,
      { width: W, height: H },
      { minKb: 40 }
    );
  }
}

// ---------------------------------------------------------------------------
// commander card — Belfast master under a navy/gold command chrome
// ---------------------------------------------------------------------------

function commanderChromeSvg(W, H) {
  const short = Math.min(W, H);
  const m = short * 0.02;
  const gw = short * 0.012;
  const bandX = W * 0.07;
  const bandY = H * 0.035;
  const bandW = W * 0.86;
  const bandH = H * 0.115;
  const nameFs = bandH * 0.42;
  const subFs = bandH * 0.18;
  const ribbonW = W * 0.36;
  const ribbonH = H * 0.05;
  const ribbonX = W * 0.055;
  const ribbonY = H * 0.915;
  const sx = W * 0.885;
  const sy = H * 0.095;
  const sr = short * 0.028;
  const starPts = [];
  for (let k = 0; k < 10; k++) {
    const a = (-90 + k * 36) * (Math.PI / 180);
    const rr = k % 2 === 0 ? sr : sr * 0.45;
    starPts.push(`${f1(sx + rr * Math.cos(a))},${f1(sy + rr * Math.sin(a))}`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="cband" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#16304c" stop-opacity="0.94"/>
      <stop offset="1" stop-color="#0c1a2c" stop-opacity="0.94"/>
    </linearGradient>
  </defs>
  <rect x="${f1(m)}" y="${f1(m)}" width="${f1(W - 2 * m)}" height="${f1(H - 2 * m)}" rx="${f1(short * 0.03)}" fill="none" stroke="#e7b73c" stroke-width="${f2(gw)}"/>
  <rect x="${f1(m + gw)}" y="${f1(m + gw)}" width="${f1(W - 2 * (m + gw))}" height="${f1(H - 2 * (m + gw))}" rx="${f1(short * 0.026)}" fill="none" stroke="#eef4ff" stroke-width="${f2(gw * 0.5)}" opacity="0.85"/>
  <g>
    <rect x="${f1(bandX)}" y="${f1(bandY)}" width="${f1(bandW)}" height="${f1(bandH)}" rx="${f1(bandH * 0.18)}" fill="url(#cband)" stroke="#e7b73c" stroke-width="${f2(short * 0.005)}"/>
    <text x="${f1(W / 2)}" y="${f1(bandY + bandH * 0.47)}" font-family="DejaVu Serif, Georgia, serif" font-weight="700" font-size="${f1(nameFs)}" fill="#f4ecd4" text-anchor="middle" style="letter-spacing:${f2(nameFs * 0.08)}px">BELFAST</text>
    <text x="${f1(W / 2)}" y="${f1(bandY + bandH * 0.82)}" font-family="Arial, sans-serif" font-weight="700" font-size="${f1(subFs)}" fill="#9ec4e8" text-anchor="middle" style="letter-spacing:${f2(subFs * 0.16)}px">ROYAL MAID — COMMANDER</text>
  </g>
  <polygon points="${starPts.join(" ")}" fill="#e7b73c" stroke="#0c1a2c" stroke-width="${f2(short * 0.003)}"/>
  <g>
    <rect x="${f1(ribbonX)}" y="${f1(ribbonY)}" width="${f1(ribbonW)}" height="${f1(ribbonH)}" rx="${f1(ribbonH * 0.2)}" fill="#e7b73c" stroke="#081420" stroke-width="${f2(H * 0.0035)}"/>
    <text x="${f1(ribbonX + ribbonW / 2)}" y="${f1(ribbonY + ribbonH * 0.7)}" font-family="Arial, sans-serif" font-weight="700" font-size="${f1(ribbonH * 0.45)}" fill="#3a2a06" text-anchor="middle" style="letter-spacing:${f2(ribbonH * 0.06)}px">COMMANDER</text>
  </g>
</svg>`;
}

async function buildCommander() {
  const outRel = "units-commander-belfast.webp";
  const { width: W, height: H } = await mirrorMeta("units-commander-sword_saint.webp");
  const art = await sharp(master("commander/belfast.webp")).resize(W, H, { fit: "cover", position: "attention" }).png().toBuffer();
  const chrome = await svgRaster(commanderChromeSvg(W, H), W, H);
  await finalizeWebp(sharp(art).composite([{ input: chrome, left: 0, top: 0 }]), outRel, { width: W, height: H }, { minKb: 50 });
}

// ---------------------------------------------------------------------------
// equipment icons — keyed Codex paintings at the 512 equipment size
// ---------------------------------------------------------------------------

const EQUIPMENT = [
  "oxygen_torpedo",
  "repair_toolkit",
  "sg_radar",
  "manjuu_piggy_bank",
  "beaver_squad_tag",
  "retrofit_blueprint"
];

async function buildEquipment() {
  for (const slug of EQUIPMENT) {
    const { width: W, height: H } = await mirrorMeta(`anime/equipment/${slug}.webp`);
    const icon = await keyedIcon(master(`equipment/${slug}.png`), Math.min(W, H));
    // Navy vignette base so the icons read on both light and dark panels.
    const bg = await svgRaster(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><radialGradient id="g" cx="0.5" cy="0.42" r="0.72"><stop offset="0" stop-color="#1c3a5e"/><stop offset="1" stop-color="#0a1424"/></radialGradient></defs><rect width="${W}" height="${H}" rx="${Math.round(W * 0.08)}" fill="url(#g)"/><rect x="${W * 0.02}" y="${H * 0.02}" width="${W * 0.96}" height="${H * 0.96}" rx="${Math.round(W * 0.07)}" fill="none" stroke="#c9a45a" stroke-width="${Math.max(2, W * 0.012)}"/></svg>`,
      W,
      H
    );
    await finalizeWebp(sharp(bg).composite([{ input: icon, gravity: "centre" }]), `anime/equipment/${slug}.webp`, { width: W, height: H }, { minKb: 8 });
  }
}

// ---------------------------------------------------------------------------
// skill icons — rank-ability icons + the Royal Salvo cast icon
// ---------------------------------------------------------------------------

async function buildSkillIcons() {
  const { width: rw, height: rh } = await mirrorMeta("ui/rank-ability/advantage.webp");
  for (const [masterName, outRel] of [
    ["icons/skill-full-barrage.png", "ui/rank-ability/full-barrage.webp"],
    ["icons/skill-fleet-formation.png", "ui/rank-ability/fleet-formation.webp"]
  ]) {
    const icon = await keyedIcon(master(masterName), rw);
    await finalizeWebp(sharp(icon), outRel, { width: rw, height: rh });
  }
  // Royal Salvo (Belfast's cast icon, referenced from data/commanders.ts).
  const salvo = await keyedIcon(master("icons/skill-royal-salvo.png"), 128);
  await finalizeWebp(sharp(salvo), "anime/icons/azur-lane/skill-royal-salvo.webp", { width: 128, height: 128 });
}

// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const runAll = args.length === 0;
  const want = (name) => runAll || args.includes(name);

  if (want("scenery")) {
    const { fullBuf, W, H } = await buildPanoramas();
    await buildBars(fullBuf);
    await buildTile();
    await buildIcon(fullBuf, W, H);
  }
  if (want("heroes")) await buildHeroes();
  if (want("commander")) await buildCommander();
  if (want("equipment")) await buildEquipment();
  if (want("icons")) await buildSkillIcons();

  console.log("\nGenerated Azur Lane art:");
  console.log("  " + "path".padEnd(62) + "dims".padEnd(12) + "bytes");
  for (const r of TABLE) console.log("  " + r.path.padEnd(62) + r.dims.padEnd(12) + r.bytes);
  console.log(`\n${TABLE.length} files written.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

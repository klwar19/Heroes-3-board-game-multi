#!/usr/bin/env node

// Generates PROCEDURAL PLACEHOLDER art for the `heavenly_demon` (Heavenly Demon
// Palace / Thiên Ma Cung) anime faction — art-only, no real illustrations.
//
// Real illustrations replace these files later at the SAME paths. Every file is a
// real, valid webp/png whose pixel dimensions MIRROR its azure_breeze / fuyuki
// twin (read live with sharp.metadata() below and reused verbatim), so the data
// wiring sees correctly-shaped assets.
//
// Design: an obsidian -> crimson diagonal gradient (so the placeholder already
// reads "evil demonic-path sect"), a blood-red border, a small demon-flame
// emblem, the file's ROLE spelled out as text, and a deterministic colour
// "signature" strip derived from the output path (guarantees every output is
// byte-distinct even where two targets share dimensions + a similar label).
//
// Idempotent + deterministic: re-running overwrites the same bytes.
//
// Run: node scripts/build-heavenly-demon-placeholder-art.mjs

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(root, "public", "assets");

// ---------------------------------------------------------------------------
// Deterministic helpers (no randomness)
// ---------------------------------------------------------------------------

// cyrb53 — a tiny, well-distributed non-crypto string hash. Seeds the per-file
// colour signature so distinctness never depends on the SVG text renderer.
function hash53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)) >>> 0;
}

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

// A blood/ember swatch from a byte (deterministic): crimson through ember-orange.
function swatch(byte) {
  const hue = (byte % 30) - 8; // -8..21 -> deep red through ember
  const wrapped = (hue + 360) % 360;
  const light = 24 + ((byte >> 3) % 34); // 24..57%
  return `hsl(${wrapped} 68% ${light}%)`;
}

// Build the placeholder SVG at exact width x height.
function placeholderSvg(width, height, roleTitle, relPath) {
  const h = hash53(relPath);
  const short = Math.min(width, height);
  const pad = Math.max(3, Math.round(short * 0.04));
  const border = Math.max(2, Math.round(short * 0.012));

  // Title -> one word per line (robust against overflow at any dimension).
  const words = String(roleTitle).trim().split(/\s+/);
  const longest = words.reduce((m, w) => Math.max(m, w.length), 1);
  const lineCount = words.length;
  const byWidth = (width * 0.86) / (longest * 0.62);
  const byHeight = (height * 0.52) / lineCount;
  const fontSize = Math.max(7, Math.min(byWidth, byHeight));
  const lineH = fontSize * 1.12;
  const blockH = lineH * lineCount;
  const startY = height / 2 - blockH / 2 + lineH * 0.78;
  const titleLines = words
    .map(
      (w, i) =>
        `<text x="${width / 2}" y="${(startY + i * lineH).toFixed(1)}" font-family="DejaVu Sans, sans-serif" font-weight="700" font-size="${fontSize.toFixed(
          1
        )}" fill="#f6e6e6" text-anchor="middle" style="letter-spacing:${(fontSize * 0.02).toFixed(2)}px">${esc(
          w
        )}</text>`
    )
    .join("");

  // Small subtitle band (skip on very small icons where it would not fit).
  const subFont = Math.max(6, Math.round(fontSize * 0.32));
  const showSub = height >= 120;
  const subtitle = showSub
    ? `<text x="${width / 2}" y="${(startY - blockH * 0.5 - lineH * 0.55).toFixed(
        1
      )}" font-family="DejaVu Sans, sans-serif" font-size="${subFont}" fill="#e6889a" text-anchor="middle" style="letter-spacing:${(
        subFont * 0.12
      ).toFixed(2)}px" opacity="0.9">HEAVENLY DEMON · placeholder</text>`
    : "";

  // Demon-flame emblem near the top (a jagged crimson sigil).
  const cx = width / 2;
  const cy = pad + short * 0.11;
  const s = short * (showSub ? 0.09 : 0.16);
  const flame = `<g opacity="0.92">
    <path d="M ${cx} ${cy - s}
      C ${cx + s * 0.9} ${cy - s * 0.2} ${cx + s * 0.55} ${cy + s} ${cx} ${cy + s}
      C ${cx - s * 0.55} ${cy + s} ${cx - s * 0.9} ${cy - s * 0.2} ${cx} ${cy - s} Z"
      fill="#c0303a" stroke="#3a0d12" stroke-width="${Math.max(1, border * 0.5).toFixed(2)}"/>
    <path d="M ${cx} ${cy - s * 0.5} L ${cx} ${cy + s * 0.55}" stroke="#3a0d12" stroke-width="${Math.max(
    1,
    border * 0.4
  ).toFixed(2)}"/>
  </g>`;

  // Deterministic colour signature strip along the bottom (10 blocks).
  const blocks = 10;
  const stripH = Math.max(4, Math.round(short * 0.055));
  const bw = width / blocks;
  let strip = "";
  for (let i = 0; i < blocks; i++) {
    const byte = (h >>> ((i % 4) * 8)) & 0xff;
    const mixed = (byte + i * 37 + width * 3 + height * 7) & 0xff;
    strip += `<rect x="${(i * bw).toFixed(2)}" y="${height - stripH}" width="${bw.toFixed(2)}" height="${stripH}" fill="${swatch(
      mixed
    )}"/>`;
  }

  const gradId = `g${h.toString(16)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#171216"/>
      <stop offset="0.55" stop-color="#3a1119"/>
      <stop offset="1" stop-color="#8b1a2b"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#${gradId})"/>
  <rect x="${border / 2}" y="${border / 2}" width="${width - border}" height="${
    height - border
  }" fill="none" stroke="#c26a74" stroke-width="${border}" opacity="0.85"/>
  ${flame}
  ${subtitle}
  ${titleLines}
  ${strip}
</svg>`;
}

async function render(relOut, mirrorRel, roleTitle, { preserveMirrorAlpha = false } = {}) {
  const mirrorPath = path.join(assets, mirrorRel);
  const meta = await sharp(mirrorPath).metadata();
  const width = meta.width;
  const height = meta.height;
  if (!width || !height) throw new Error(`No dimensions for mirror source: ${mirrorRel}`);

  const outPath = path.join(assets, relOut);
  await mkdir(path.dirname(outPath), { recursive: true });

  const svg = placeholderSvg(width, height, roleTitle, relOut);
  let pipeline = sharp(Buffer.from(svg)).resize(width, height, { fit: "fill" }).ensureAlpha();
  if (preserveMirrorAlpha) {
    // Cut the placeholder to the mirror's flower-shaped alpha (dest-in keeps the
    // placeholder only where the mirror is opaque), so a tile's corners stay
    // transparent and blend with the board — required by tile-art-transparency.
    const mirrorBuf = await sharp(mirrorPath).resize(width, height, { fit: "fill" }).ensureAlpha().toBuffer();
    pipeline = pipeline.composite([{ input: mirrorBuf, blend: "dest-in" }]);
  }
  pipeline = relOut.endsWith(".png")
    ? pipeline.png({ compressionLevel: 9 })
    : pipeline.webp({ quality: 90, effort: 6, alphaQuality: 100 });
  await pipeline.toFile(outPath);

  const out = await sharp(outPath).metadata();
  if (out.width !== width || out.height !== height) {
    throw new Error(`Dimension mismatch for ${relOut}: got ${out.width}x${out.height}, want ${width}x${height}`);
  }
  console.log(`${out.width}x${out.height}\t${out.format}\t${path.relative(root, outPath)}  (mirror ${mirrorRel})`);
  return path.relative(root, outPath);
}

// ---------------------------------------------------------------------------
// Roster / mirror maps
// ---------------------------------------------------------------------------

// Every unit card mirrors a SAME-TIER azure_breeze card (all are 743x1040).
const AZURE_UNIT_BY_TIER = {
  bronze: "anime/units/azure-breeze/units-azure-breeze-bronze-outer-sect-disciples",
  silver: "anime/units/azure-breeze/units-azure-breeze-silver-sect-protectors",
  golden: "anime/units/azure-breeze/units-azure-breeze-golden-true-inheritors"
};

// slug (dashed, per art filenames) + tier + display label. Order/spread mirrors
// the data: 3 bronze / 2 silver / 2 gold.
const UNITS = [
  { slug: "blood-disciples", tier: "bronze", label: "BLOOD DISCIPLES" },
  { slug: "gu-witches", tier: "bronze", label: "GU WITCHES" },
  { slug: "shadow-wraiths", tier: "bronze", label: "SHADOW WRAITHS" },
  { slug: "corpse-puppets", tier: "silver", label: "CORPSE PUPPETS" },
  { slug: "bone-reavers", tier: "silver", label: "BONE REAVERS" },
  { slug: "ghost-king", tier: "golden", label: "GHOST KING" },
  { slug: "demon-avatar", tier: "golden", label: "HEAVENLY DEMON AVATAR" }
];

// One MIGHT hero for now — mirror bin (fuyuki might portrait, 1086x1448).
const HEROES = [{ id: "xuedao", label: "XUEDAO", mirror: "anime/heroes/bin.png" }];

async function main() {
  const generated = [];

  // 14 unit cards (few + pack)
  for (const u of UNITS) {
    const base = AZURE_UNIT_BY_TIER[u.tier];
    for (const side of ["few", "pack"]) {
      generated.push(
        await render(
          `anime/units/heavenly-demon/units-heavenly-demon-${u.tier}-${u.slug}-${side}.webp`,
          `${base}-${side}.webp`,
          `${u.label} — ${side.toUpperCase()}`
        )
      );
    }
  }

  // Hero portrait(s)
  for (const hero of HEROES) {
    generated.push(await render(`anime/heroes/${hero.id}.png`, hero.mirror, hero.label));
  }

  // Town panoramas (empty + full)
  generated.push(
    await render(
      "anime/towns/heavenly-demon-palace-empty.webp",
      "anime/towns/azure-breeze-sect-empty-v2.webp",
      "HEAVENLY DEMON PALACE — EMPTY"
    )
  );
  generated.push(
    await render(
      "anime/towns/heavenly-demon-palace-full.webp",
      "anime/towns/azure-breeze-sect-full.webp",
      "HEAVENLY DEMON PALACE — FULL"
    )
  );

  // 7 town-board bar strips (bar 1 is 238 wide, 2..7 are 239 — mirror per bar)
  for (let n = 1; n <= 7; n++) {
    generated.push(
      await render(
        `town-board/heavenly-demon-bar-${n}.webp`,
        `town-board/azure-breeze-bar-${n}.webp`,
        `HEAVENLY DEMON BAR ${n}`
      )
    );
  }

  // Starting tile D-S1 (mirror A-S1) — keep the flower-shaped alpha so the tile
  // corners stay transparent on the board (tile-art-transparency invariant).
  generated.push(
    await render("anime/tiles/d-s1.webp", "anime/tiles/a-s1.webp", "HEAVENLY DEMON D-S1", { preserveMirrorAlpha: true })
  );

  // Town icon (raw id in the filename, per townIconUrl)
  generated.push(await render("town-icon-heavenly_demon.webp", "town-icon-azure_breeze.webp", "HD"));

  console.log(`\nGenerated ${generated.length} placeholder art files.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

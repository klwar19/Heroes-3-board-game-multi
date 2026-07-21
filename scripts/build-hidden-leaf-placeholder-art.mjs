#!/usr/bin/env node

// Generates PROCEDURAL PLACEHOLDER art for the upcoming `hidden_leaf`
// (Hidden Leaf Village) anime faction — Step 1 of that town, art-only.
//
// No game code references these files yet; real illustrations replace them
// later at the SAME paths. Every file is a real, valid webp/png whose pixel
// dimensions MIRROR its azure_breeze / fuyuki twin (read live with
// sharp.metadata() below and reused verbatim), so the eventual data wiring
// sees correctly-shaped assets from day one.
//
// Design: a leaf-green -> slate diagonal gradient, a border, a small leaf
// emblem, the file's ROLE spelled out as text, and a deterministic colour
// "signature" strip derived from the output path. The signature guarantees
// every output is byte-distinct from every other even where two targets
// happen to share both dimensions and a very similar label (it never relies
// on font availability for distinctness).
//
// Idempotent + deterministic: re-running overwrites the same bytes.
//
// Run: node scripts/build-hidden-leaf-placeholder-art.mjs

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

// A leaf-toned swatch from a byte (deterministic).
function swatch(byte) {
  const hue = 95 + (byte % 60); // 95..154 -> greens through teal
  const light = 32 + ((byte >> 3) % 40); // 32..71%
  return `hsl(${hue} 55% ${light}%)`;
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
  // Fit the longest word to width and the stack to ~55% of height.
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
        )}" fill="#f2f7ee" text-anchor="middle" style="letter-spacing:${(fontSize * 0.02).toFixed(2)}px">${esc(
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
      )}" font-family="DejaVu Sans, sans-serif" font-size="${subFont}" fill="#b9e6a8" text-anchor="middle" style="letter-spacing:${(
        subFont * 0.12
      ).toFixed(2)}px" opacity="0.9">HIDDEN LEAF · placeholder</text>`
    : "";

  // Leaf emblem near the top.
  const cx = width / 2;
  const cy = pad + short * 0.11;
  const s = short * (showSub ? 0.09 : 0.16);
  const leaf = `<g opacity="0.92">
    <path d="M ${cx} ${cy - s} C ${cx + s} ${cy - s} ${cx + s} ${cy + s} ${cx} ${cy + s} C ${cx - s} ${cy + s} ${
    cx - s
  } ${cy - s} ${cx} ${cy - s} Z" fill="#7fce6a" stroke="#2f5a28" stroke-width="${Math.max(1, border * 0.5).toFixed(
    2
  )}"/>
    <path d="M ${cx} ${cy - s} L ${cx} ${cy + s}" stroke="#2f5a28" stroke-width="${Math.max(1, border * 0.4).toFixed(
    2
  )}"/>
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
      <stop offset="0" stop-color="#4f9d45"/>
      <stop offset="0.55" stop-color="#33623a"/>
      <stop offset="1" stop-color="#26313a"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#${gradId})"/>
  <rect x="${border / 2}" y="${border / 2}" width="${width - border}" height="${
    height - border
  }" fill="none" stroke="#dfe9c8" stroke-width="${border}" opacity="0.85"/>
  ${leaf}
  ${subtitle}
  ${titleLines}
  ${strip}
</svg>`;
}

async function render(relOut, mirrorRel, roleTitle) {
  const mirrorPath = path.join(assets, mirrorRel);
  const meta = await sharp(mirrorPath).metadata();
  const width = meta.width;
  const height = meta.height;
  if (!width || !height) throw new Error(`No dimensions for mirror source: ${mirrorRel}`);

  const outPath = path.join(assets, relOut);
  await mkdir(path.dirname(outPath), { recursive: true });

  const svg = placeholderSvg(width, height, roleTitle, relOut);
  // Author the SVG at exact dims; force the raster to those exact dims too so
  // DPI heuristics can never shift them off the mirror.
  let pipeline = sharp(Buffer.from(svg)).resize(width, height, { fit: "fill" });
  pipeline = relOut.endsWith(".png")
    ? pipeline.png({ compressionLevel: 9 })
    : pipeline.webp({ quality: 90, effort: 6 });
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
// fuyuki: 3 bronze / 2 silver / 2 gold.
const UNITS = [
  { slug: "genin-squad", tier: "bronze", label: "GENIN SQUAD" },
  { slug: "medical-nin", tier: "bronze", label: "MEDICAL-NIN" },
  { slug: "anbu", tier: "bronze", label: "ANBU BLACK OPS" },
  { slug: "jonin", tier: "silver", label: "JONIN" },
  { slug: "giant-toad", tier: "silver", label: "GIANT TOAD" },
  { slug: "jinchuriki", tier: "golden", label: "JINCHURIKI" },
  { slug: "susanoo", tier: "golden", label: "SUSANOO AVATAR" }
];

// Hero portraits are PNG. Might heroes mirror bin (fuyuki might); the magic hero
// mirrors aoko (fuyuki magic) — same anime-hero family, both 1086x1448.
const HEROES = [
  { id: "naruto", label: "NARUTO UZUMAKI", mirror: "anime/heroes/bin.png" },
  { id: "sasuke", label: "SASUKE UCHIHA", mirror: "anime/heroes/bin.png" },
  { id: "tsunade", label: "TSUNADE", mirror: "anime/heroes/aoko.png" }
];

async function main() {
  const generated = [];

  // 14 unit cards (few + pack)
  for (const u of UNITS) {
    const base = AZURE_UNIT_BY_TIER[u.tier];
    for (const side of ["few", "pack"]) {
      generated.push(
        await render(
          `anime/units/hidden-leaf/units-hidden-leaf-${u.tier}-${u.slug}-${side}.webp`,
          `${base}-${side}.webp`,
          `${u.label} — ${side.toUpperCase()}`
        )
      );
    }
  }

  // 3 hero portraits
  for (const hHero of HEROES) {
    generated.push(await render(`anime/heroes/${hHero.id}.png`, hHero.mirror, hHero.label));
  }

  // Town panoramas (empty + full)
  generated.push(
    await render(
      "anime/towns/hidden-leaf-village-empty.webp",
      "anime/towns/azure-breeze-sect-empty-v2.webp",
      "HIDDEN LEAF VILLAGE — EMPTY"
    )
  );
  generated.push(
    await render(
      "anime/towns/hidden-leaf-village-full.webp",
      "anime/towns/azure-breeze-sect-full.webp",
      "HIDDEN LEAF VILLAGE — FULL"
    )
  );

  // 7 town-board bar strips (bar 1 is 238 wide, 2..7 are 239 — mirror per bar)
  for (let n = 1; n <= 7; n++) {
    generated.push(
      await render(`town-board/hidden-leaf-bar-${n}.webp`, `town-board/azure-breeze-bar-${n}.webp`, `HIDDEN LEAF BAR ${n}`)
    );
  }

  // Starting tile L-S1 (mirror A-S1)
  generated.push(await render("anime/tiles/l-s1.webp", "anime/tiles/a-s1.webp", "HIDDEN LEAF L-S1"));

  // Town icon (raw id in the filename, per townIconUrl)
  generated.push(await render("town-icon-hidden_leaf.webp", "town-icon-azure_breeze.webp", "HL"));

  // WOG commander card — mirror the azure_breeze commander (Sword Saint) card
  generated.push(
    await render("units-commander-might_guy.webp", "units-commander-sword_saint.webp", "MIGHT GUY — COMMANDER")
  );

  console.log(`\nGenerated ${generated.length} placeholder art files.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

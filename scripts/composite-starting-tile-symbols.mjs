#!/usr/bin/env node
/**
 * Bake HoMM3-style field symbols onto a starting-tile atmosphere webp.
 * Positions use the engine's pointy-top flower layout (same as screen.tsx art box).
 *
 * Usage:
 *   node scripts/composite-starting-tile-symbols.mjs w-s1
 *   node scripts/composite-starting-tile-symbols.mjs a-s1
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Engine art-box normalized centers: slot 0=C, 1=NE…6=NW (rotation 0). */
const SLOT_NORM = [
  { x: 0.5, y: 0.5 },
  { x: 0.667, y: 0.2 },
  { x: 0.833, y: 0.5 },
  { x: 0.667, y: 0.8 },
  { x: 0.333, y: 0.8 },
  { x: 0.167, y: 0.5 },
  { x: 0.333, y: 0.2 }
];

/**
 * Per-tile: which slots get which baked symbols (must match expansion-tiles.ts).
 * Icon is drawn centered in the hex, with optional roman I above and ↻N below.
 */
const TILE_PLANS = {
  "w-s1": {
    base: "out/refs/w-s1-atmosphere-base.webp",
    out: "public/assets/anime/tiles/w-s1.webp",
    // W-S1 fields: C town, NE empty, E empty, SE resource, SW blocked, W treasure, NW mine
    symbols: [
      { slot: 3, kind: "resource" },
      { slot: 5, kind: "treasure", difficulty: 1 },
      { slot: 6, kind: "mine", difficulty: 1, amount: 2 }
    ]
  },
  "a-s1": {
    // base set by caller after a proper flower atmosphere exists
    base: "out/refs/a-s1-flower-base.webp",
    out: "public/assets/anime/tiles/a-s1.webp",
    // A-S1 = S4 layout: C town, NE resource, E blocked, SE empty, SW treasure, W mine, NW empty
    symbols: [
      { slot: 1, kind: "resource" },
      { slot: 4, kind: "treasure", difficulty: 1 },
      { slot: 5, kind: "mine", difficulty: 1, amount: 2 }
    ]
  }
};

const ASSETS = {
  // Cream/gold board-print glyphs (same family as treasure + roman I) — not the photo tools.
  resource: "public/assets/glyphs/resource-yellow.svg",
  treasure: "public/assets/ui/icon-treasure-chest-glyph.webp",
  mine: "public/assets/glyphs/building_materials.svg"
};

async function makeBadge(text, { size = 96, fill = "#f3e2b0" } = {}) {
  const svg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#000" flood-opacity="0.75"/>
    </filter>
  </defs>
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
    font-family="Georgia, 'Times New Roman', serif" font-size="${Math.round(size * 0.72)}"
    font-weight="700" fill="${fill}" stroke="#1a1006" stroke-width="${Math.max(2, size * 0.04)}"
    paint-order="stroke" filter="url(#s)">${text}</text>
</svg>`);
  return sharp(svg).png().toBuffer();
}

async function makeAmountBadge(amount, size = 110) {
  const svg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${Math.round(size * 0.55)}" viewBox="0 0 ${size} ${Math.round(size * 0.55)}">
  <defs>
    <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-color="#000" flood-opacity="0.7"/>
    </filter>
  </defs>
  <text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle"
    font-family="Georgia, 'Times New Roman', serif" font-size="${Math.round(size * 0.42)}"
    font-weight="700" fill="#f3e2b0" stroke="#1a1006" stroke-width="2.5"
    paint-order="stroke" filter="url(#s)">↻${amount}</text>
</svg>`);
  return sharp(svg).png().toBuffer();
}

async function prepareIcon(kind, hexSize) {
  const src = path.join(root, ASSETS[kind]);
  // Compact board glyphs; resource a hair larger so cream tools stay readable at night.
  const iconPx = Math.round(hexSize * (kind === "resource" ? 0.34 : 0.26));
  return sharp(src)
    .resize(iconPx, iconPx, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer({ resolveWithObject: true });
}

async function compositeTile(planKey) {
  const plan = TILE_PLANS[planKey];
  if (!plan) {
    throw new Error(`unknown tile ${planKey}`);
  }
  const basePath = path.join(root, plan.base);
  const outPath = path.join(root, plan.out);
  if (!fs.existsSync(basePath)) {
    throw new Error(`missing base ${plan.base}`);
  }

  const base = sharp(basePath);
  const meta = await base.metadata();
  const W = meta.width;
  const H = meta.height;
  // Engine art box is 3√3 : 5 ≈ 1.039 width/height; square tiles letterbox the flower.
  // Use the full image as the art box (matches how screen.tsx stretches tileImage).
  const hexSize = Math.min(W, H) / 5; // engine: art height = 5 * HEX_SIZE

  const composites = [];

  for (const sym of plan.symbols) {
    const { x: nx, y: ny } = SLOT_NORM[sym.slot];
    const cx = Math.round(nx * W);
    const cy = Math.round(ny * H);

    const { data: iconBuf, info: iconInfo } = await prepareIcon(sym.kind, hexSize);
    composites.push({
      input: iconBuf,
      left: Math.round(cx - iconInfo.width / 2),
      top: Math.round(cy - iconInfo.height / 2 + hexSize * 0.06)
    });

    if (sym.difficulty) {
      const badge = await makeBadge("Ⅰ", { size: Math.round(hexSize * 0.32) });
      const bMeta = await sharp(badge).metadata();
      composites.push({
        input: badge,
        left: Math.round(cx - bMeta.width / 2),
        top: Math.round(cy - hexSize * 0.42 - bMeta.height / 2)
      });
    }

    if (sym.amount) {
      const amt = await makeAmountBadge(sym.amount, Math.round(hexSize * 0.48));
      const aMeta = await sharp(amt).metadata();
      composites.push({
        input: amt,
        left: Math.round(cx - aMeta.width / 2),
        top: Math.round(cy + hexSize * 0.28 - aMeta.height / 2)
      });
    }
  }

  await sharp(basePath)
    .composite(composites)
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toFile(outPath);

  const st = fs.statSync(outPath);
  const outMeta = await sharp(outPath).metadata();
  console.log(
    `OK ${planKey} → ${path.relative(root, outPath)} ${st.size}B ${outMeta.width}x${outMeta.height} alpha=${outMeta.hasAlpha}`
  );
}

const key = process.argv[2];
if (!key || !TILE_PLANS[key]) {
  console.error("usage: node scripts/composite-starting-tile-symbols.mjs <w-s1|a-s1>");
  process.exit(1);
}
await compositeTile(key);

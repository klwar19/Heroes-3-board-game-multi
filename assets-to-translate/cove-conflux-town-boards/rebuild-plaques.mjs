#!/usr/bin/env node
import sharp from "sharp";
import { readFileSync, existsSync, copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const REPO = path.resolve(ROOT, "../..");
const ENGLISH = path.join(ROOT, "english");
const FINAL = path.join(ROOT, "final");
const REVIEW = path.join(ROOT, "review");
const GLYPHS = path.join(ROOT, "glyphs-ref");
const FONT = path.join(REPO, "public/fonts/LiberationSerif-Bold.ttf");
const TILE_W = 385;
const TILE_H = 813;

const boldB64 = readFileSync(FONT).toString("base64");
const fontCss = `@font-face { font-family: 'LibSerif'; src: url('data:font/ttf;base64,${boldB64}') format('truetype'); font-weight: 700; }`;

function gUri(name) {
  const p = path.join(GLYPHS, `${name}.png`);
  if (!existsSync(p)) return null;
  return `data:image/png;base64,${readFileSync(p).toString("base64")}`;
}
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const BUILDINGS = {
  cove: [
    { id: "thieves_guild", name: "Thieves' Guild", cost: { gold: 4, buildingMaterials: 2, valuables: 1 } },
    { id: "city_hall", name: "City Hall", cost: { gold: 10, buildingMaterials: 4, valuables: 0 } },
    { id: "dwelling_bronze", name: "Bay", cost: { gold: 4, buildingMaterials: 3, valuables: 1 } },
    { id: "mage_guild", name: "Mage Guild", cost: { gold: 4, buildingMaterials: 2, valuables: 1 } },
    { id: "dwelling_gold", name: "Redoubled Vortex", cost: { gold: 10, buildingMaterials: 8, valuables: 4 } },
    { id: "citadel", name: "Citadel", cost: { gold: 8, buildingMaterials: 4, valuables: 1 } },
    { id: "dwelling_silver", name: "Nests Towering the Seas", cost: { gold: 8, buildingMaterials: 6, valuables: 3 } },
    { id: "pub", name: "Pub", cost: { gold: 3, buildingMaterials: 2, valuables: 0 } }
  ],
  conflux: [
    { id: "city_hall", name: "City Hall", cost: { gold: 10, buildingMaterials: 3, valuables: 0 } },
    { id: "magic_university", name: "Magic University", cost: { gold: 6, buildingMaterials: 3, valuables: 0 } },
    { id: "mage_guild", name: "Mage Guild", cost: { gold: 4, buildingMaterials: 2, valuables: 1 } },
    { id: "dwelling_silver", name: "Altars of Fire and Earth", cost: { gold: 8, buildingMaterials: 6, valuables: 3 } },
    { id: "dwelling_gold", name: "Magical Pyre", cost: { gold: 9, buildingMaterials: 8, valuables: 4 } },
    { id: "citadel", name: "Citadel", cost: { gold: 8, buildingMaterials: 4, valuables: 1 } },
    { id: "dwelling_bronze", name: "Altars of Air and Water", cost: { gold: 4, buildingMaterials: 3, valuables: 1 } },
    { id: "garden_of_life", name: "Garden of Life", cost: { gold: 2, buildingMaterials: 1, valuables: 1 } }
  ]
};

async function makePlaque(building, outPath) {
  const woodPath = path.join(GLYPHS, "wood-bg.webp");
  const wood = await sharp(woodPath).resize(TILE_W, TILE_H, { fit: "fill" }).toBuffer();

  const name = building.name;
  const words = name.split(" ");
  let line1 = name;
  let line2 = "";
  if (name.length > 14 && words.length > 1) {
    const mid = Math.ceil(words.length / 2);
    line1 = words.slice(0, mid).join(" ");
    line2 = words.slice(mid).join(" ");
  }
  const titleSize = name.length > 18 ? 28 : name.length > 12 ? 32 : 36;
  const plaqueTop = Math.round((TILE_H - (line2 ? 168 : 140)) / 2) - 20;
  const costY = plaqueTop + (line2 ? 92 : 64) + 24;
  const icon = 32;
  const fs = 28;
  // measure cost row width for centering
  const cost = building.cost;
  const parts = [
    { n: cost.gold, g: "gold" },
    { n: cost.buildingMaterials, g: "building_materials" },
    { n: cost.valuables, g: "valuables" }
  ];
  let costW = 0;
  for (const p of parts) {
    costW += String(p.n).length * fs * 0.62 + 3 + icon + 14;
  }
  costW -= 14;
  let cx = Math.round((TILE_W - costW) / 2);
  let costSvg = "";
  for (const p of parts) {
    costSvg += `<text x="${cx}" y="${costY}" font-family="LibSerif" font-weight="700" font-size="${fs}" fill="#f5e6c8" dominant-baseline="middle">${p.n}</text>`;
    cx += String(p.n).length * fs * 0.62 + 3;
    const href = gUri(p.g);
    if (href) costSvg += `<image href="${href}" x="${cx}" y="${costY - icon / 2}" width="${icon}" height="${icon}"/>`;
    cx += icon + 14;
  }

  const svg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${TILE_W}" height="${TILE_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>${fontCss}
      .title { font-family: LibSerif; font-weight: 700; fill: #f4ecd4; text-anchor: middle; }
    </style>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#4a6b3a"/>
      <stop offset="100%" stop-color="#2f4a28"/>
    </linearGradient>
  </defs>
  <rect x="42" y="${plaqueTop}" width="${TILE_W - 84}" height="${line2 ? 92 : 64}" rx="4" fill="url(#g)" stroke="#c9b896" stroke-width="2"/>
  <text class="title" x="${TILE_W / 2}" y="${plaqueTop + (line2 ? 38 : 42)}" font-size="${titleSize}">${esc(line1)}</text>
  ${line2 ? `<text class="title" x="${TILE_W / 2}" y="${plaqueTop + 72}" font-size="${titleSize}">${esc(line2)}</text>` : ""}
  <rect x="42" y="${plaqueTop + (line2 ? 92 : 64)}" width="${TILE_W - 84}" height="48" fill="#3a2a1c" stroke="#c9b896" stroke-width="2"/>
  ${costSvg}
</svg>`);

  await sharp(wood)
    .composite([{ input: await sharp(svg).png().toBuffer(), top: 0, left: 0 }])
    .webp({ quality: 90 })
    .toFile(outPath);
}

async function contactSheet(files, outPath, cols) {
  const tw = 160,
    th = 338;
  const thumbs = [];
  for (const f of files) {
    thumbs.push(await sharp(f).resize(tw, th, { fit: "cover" }).png().toBuffer());
  }
  const rows = Math.ceil(thumbs.length / cols);
  const comps = thumbs.map((buf, i) => ({
    input: buf,
    left: 8 + (i % cols) * (tw + 8),
    top: 8 + Math.floor(i / cols) * (th + 8)
  }));
  await sharp({
    create: {
      width: cols * tw + (cols + 1) * 8,
      height: rows * th + (rows + 1) * 8,
      channels: 3,
      background: { r: 30, g: 24, b: 18 }
    }
  })
    .composite(comps)
    .webp({ quality: 90 })
    .toFile(outPath);
}

const sheets = { cove: [], conflux: [] };
for (const [faction, list] of Object.entries(BUILDINGS)) {
  for (const b of list) {
    const p = path.join(ENGLISH, `${faction}-${b.id}-unbuilt.webp`);
    await makePlaque(b, p);
    copyFileSync(p, path.join(FINAL, path.basename(p)));
    sheets[faction].push(p);
    console.log("plaque", path.basename(p));
  }
}
await contactSheet(sheets.cove, path.join(REVIEW, "cove-unbuilt-plaques.webp"), 4);
await contactSheet(sheets.conflux, path.join(REVIEW, "conflux-unbuilt-plaques.webp"), 4);
console.log("plaques done");

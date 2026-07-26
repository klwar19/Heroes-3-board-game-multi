/**
 * Build the two PvE-only combat boards from their committed ImageGen masters.
 *
 * Each square master is one continuous art direction sheet:
 *   - a cinematic horizon strip at the top;
 *   - an orthographic empty play surface below.
 *
 * This script crops those authored regions, normalizes them to the dimensions
 * used by every existing combat board, and adds the exact 5-column x 4-row
 * gameplay grid in code so the generated art can never drift off the engine's
 * twenty logical spaces.
 *
 * Run: node scripts/build-pve-battlefields.mjs
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW_DIR = path.join(ROOT, "scripts", "anime-art", "raw", "battlefields");
const OUT_DIR = path.join(ROOT, "public", "assets", "board");

const BOARD_WIDTH = 2500;
const BOARD_HEIGHT = 2000;
const SCENERY_WIDTH = 2500;
const SCENERY_HEIGHT = 520;

const MASTERS = [
  {
    id: "pve-calamity-classic",
    file: "pve-calamity-classic-master.png",
    splitY: 345,
    grid: {
      shadow: "#060a14",
      mid: "#3f355e",
      highlight: "#a698d1"
    }
  },
  {
    id: "pve-calamity-doom",
    file: "pve-calamity-doom-master.png",
    splitY: 274,
    grid: {
      shadow: "#090403",
      mid: "#5c241b",
      highlight: "#cb6a45"
    }
  }
];

function gridOverlay({ shadow, mid, highlight }) {
  const vertical = [500, 1000, 1500, 2000];
  const horizontal = [500, 1000, 1500];
  const paths = [
    ...vertical.map((x) => `M ${x} 0 V ${BOARD_HEIGHT}`),
    ...horizontal.map((y) => `M 0 ${y} H ${BOARD_WIDTH}`)
  ].join(" ");

  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${BOARD_WIDTH}" height="${BOARD_HEIGHT}">
      <defs>
        <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${highlight}" stop-opacity=".82"/>
          <stop offset=".5" stop-color="${mid}" stop-opacity=".9"/>
          <stop offset="1" stop-color="${shadow}" stop-opacity=".95"/>
        </linearGradient>
        <radialGradient id="vignette" cx=".5" cy=".48" r=".72">
          <stop offset=".55" stop-color="#000" stop-opacity="0"/>
          <stop offset="1" stop-color="#000" stop-opacity=".34"/>
        </radialGradient>
      </defs>
      <path d="${paths}" fill="none" stroke="${shadow}" stroke-opacity=".72" stroke-width="12"/>
      <path d="${paths}" fill="none" stroke="${mid}" stroke-opacity=".72" stroke-width="5"/>
      <path d="${paths}" fill="none" stroke="${highlight}" stroke-opacity=".42" stroke-width="1.5"/>
      <rect x="13" y="13" width="${BOARD_WIDTH - 26}" height="${BOARD_HEIGHT - 26}"
        rx="28" fill="none" stroke="${shadow}" stroke-opacity=".9" stroke-width="26"/>
      <rect x="20" y="20" width="${BOARD_WIDTH - 40}" height="${BOARD_HEIGHT - 40}"
        rx="24" fill="none" stroke="url(#edge)" stroke-width="7"/>
      <rect width="${BOARD_WIDTH}" height="${BOARD_HEIGHT}" fill="url(#vignette)"/>
    </svg>
  `);
}

for (const master of MASTERS) {
  const input = path.join(RAW_DIR, master.file);
  const metadata = await sharp(input).metadata();
  if (!metadata.width || !metadata.height || master.splitY >= metadata.height) {
    throw new Error(`Invalid master geometry: ${master.file}`);
  }

  const scenery = sharp(input)
    .extract({ left: 0, top: 0, width: metadata.width, height: master.splitY })
    .resize(SCENERY_WIDTH, SCENERY_HEIGHT, { fit: "cover", position: "centre" })
    .webp({ quality: 88, effort: 6 });

  const boardBase = await sharp(input)
    .extract({
      left: 0,
      top: master.splitY,
      width: metadata.width,
      height: metadata.height - master.splitY
    })
    .resize(BOARD_WIDTH, BOARD_HEIGHT, { fit: "cover", position: "centre" })
    .toBuffer();

  await scenery.toFile(path.join(OUT_DIR, `battlefield-4x5-${master.id}-scenery.webp`));
  await sharp(boardBase)
    .composite([{ input: gridOverlay(master.grid), blend: "over" }])
    .webp({ quality: 88, effort: 6 })
    .toFile(path.join(OUT_DIR, `battlefield-4x5-${master.id}.webp`));
}

console.log(`Built ${MASTERS.length} PvE battlefield pairs in ${OUT_DIR}`);

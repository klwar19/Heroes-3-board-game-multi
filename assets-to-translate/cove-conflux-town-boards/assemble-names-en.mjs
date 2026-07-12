#!/usr/bin/env node
/**
 * Composite English nameplates onto the good empty boards (defs already EN).
 * Does NOT touch review/ (Polish-name batch stays the fallback).
 * Output → review-names-en/
 */
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const SESS =
  "C:/Users/klwar/.grok/sessions/C%3A%5CUsers%5Cklwar%5CHeroes-3-board-game-multi/019f578e-30d9-7c61-a591-65386be30d96/images";
const OUT = path.join(ROOT, "review-names-en");
const FINAL = path.join(ROOT, "final");
const WORK = path.join(ROOT, "work");
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.join(WORK, "nameplates-en"), { recursive: true });

// Session image map from successful plate edits
const MAP = {
  cove: {
    thieves_guild: "22.jpg",
    city_hall: "16.jpg",
    dwelling_bronze: "17.jpg",
    mage_guild: "23.jpg",
    dwelling_gold: "15.jpg",
    citadel: "20.jpg",
    dwelling_silver: "18.jpg",
    pub: "19.jpg"
  },
  conflux: {
    city_hall: "21.jpg",
    magic_university: "24.jpg",
    mage_guild: "26.jpg",
    dwelling_silver: "28.jpg",
    dwelling_gold: "27.jpg",
    citadel: "25.jpg",
    dwelling_bronze: "29.jpg",
    garden_of_life: "30.jpg"
  }
};

const TILE_ORDER = {
  cove: [
    "thieves_guild",
    "city_hall",
    "dwelling_bronze",
    "mage_guild",
    "dwelling_gold",
    "citadel",
    "dwelling_silver"
  ],
  conflux: [
    "city_hall",
    "magic_university",
    "mage_guild",
    "dwelling_silver",
    "dwelling_gold",
    "citadel",
    "dwelling_bronze"
  ]
};

async function assemble(fac) {
  const coords = JSON.parse(fs.readFileSync(path.join(WORK, "nameplates-pl", `${fac}-coords.json`), "utf8"));
  const emptyBase = path.join(FINAL, `towns-${fac}-empty.webp`); // good batch: defs EN, names PL
  const overlays = [];

  for (const c of coords) {
    const imgName = MAP[fac][c.id];
    if (!imgName) {
      console.warn("missing map", fac, c.id);
      continue;
    }
    const src = path.join(SESS, imgName);
    if (!fs.existsSync(src)) {
      console.warn("missing file", src);
      continue;
    }
    const plate = await sharp(src)
      .resize(c.width, c.height, { fit: "fill" })
      .png()
      .toBuffer();
    await sharp(plate)
      .webp({ quality: 92 })
      .toFile(path.join(WORK, "nameplates-en", `${fac}-${c.id}.webp`));
    overlays.push({ input: plate, left: c.left, top: c.top });
    console.log("plate", fac, c.id, `@${c.left},${c.top}`);
  }

  const emptyEn = path.join(OUT, `${fac}-empty-NAMES-EN.webp`);
  await sharp(emptyBase).composite(overlays).webp({ quality: 93 }).toFile(emptyEn);
  console.log("empty", emptyEn);

  // Full with tiles (same seating as good batch)
  const meta = await sharp(emptyEn).metadata();
  const W = meta.width;
  const H = meta.height;
  const winLeft = Math.round(W * 0.042);
  const winTop = Math.round(H * 0.055);
  const winBottom = Math.round(H * 0.44);
  const winRight = Math.round(W * 0.958);
  const barW = Math.floor((winRight - winLeft) / 7);
  const slotH = winBottom - winTop;
  const comps = [];
  for (let i = 0; i < 7; i++) {
    const id = TILE_ORDER[fac][i];
    const tp = path.join(WORK, "tiles", `${fac}-${id}.webp`);
    if (!fs.existsSync(tp)) continue;
    const left = winLeft + i * barW;
    const tw = i === 6 ? winRight - left : barW;
    const buf = await sharp(tp).resize(tw, slotH, { fit: "cover", position: "centre" }).png().toBuffer();
    comps.push({ input: buf, left, top: winTop });
  }
  const fullEn = path.join(OUT, `${fac}-full-NAMES-EN.webp`);
  await sharp(emptyEn).composite(comps).webp({ quality: 93 }).toFile(fullEn);
  console.log("full", fullEn);
}

for (const fac of ["cove", "conflux"]) {
  await assemble(fac);
}

// README
fs.writeFileSync(
  path.join(OUT, "README.md"),
  `# Name translation attempt (check this vs previous batch)

## Fallback (keep if names look bad)

\`review/\` — empty boards with **English definitions**, **Polish building names**  
(that is the known-good Castle-style batch)

## This folder — English names attempt

| File | What |
|------|------|
| \`00-*-NAMES-STILL-POLISH.webp\` | copy of good empty (compare) |
| \`cove-empty-NAMES-EN.webp\` | empty board, defs EN + **names EN** |
| \`conflux-empty-NAMES-EN.webp\` | empty board, defs EN + **names EN** |
| \`cove-full-NAMES-EN.webp\` | full with tiles + English names |
| \`conflux-full-NAMES-EN.webp\` | full with tiles + English names |

Whole-board image-gen for names **failed** (corrupted landscape into Castle).  
These use **per-nameplate** edits composited onto the good empty boards.

If names look soft/wrong, **stay on \`review/\`**.
`
);

console.log("DONE →", OUT);

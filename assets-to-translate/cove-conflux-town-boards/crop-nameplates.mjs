#!/usr/bin/env node
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, "work/nameplates-pl");
fs.mkdirSync(OUT, { recursive: true });

const COVE = [
  { id: "thieves_guild", left: 47, top: 50, width: 91, height: 58, en: "Thieves' Guild" },
  { id: "city_hall", left: 155, top: 50, width: 91, height: 58, en: "City Hall" },
  { id: "dwelling_bronze", left: 264, top: 50, width: 90, height: 58, en: "Bay" },
  { id: "mage_guild", left: 372, top: 50, width: 90, height: 58, en: "Mage Guild" },
  { id: "dwelling_gold", left: 480, top: 50, width: 90, height: 58, en: "Redoubled Vortex" },
  { id: "citadel", left: 588, top: 50, width: 90, height: 58, en: "Citadel" },
  { id: "dwelling_silver", left: 697, top: 50, width: 89, height: 58, en: "Nests Towering the Seas" },
  { id: "pub", left: 263, top: 109, width: 93, height: 54, en: "Pub" }
];

const CONFLUX = [
  { id: "city_hall", left: 47, top: 49, width: 92, height: 59, en: "City Hall" },
  { id: "magic_university", left: 155, top: 49, width: 92, height: 59, en: "Magic University" },
  { id: "mage_guild", left: 264, top: 49, width: 91, height: 59, en: "Mage Guild" },
  { id: "dwelling_silver", left: 372, top: 49, width: 91, height: 59, en: "Altars of Fire and Earth" },
  { id: "dwelling_gold", left: 480, top: 49, width: 91, height: 59, en: "Magical Pyre" },
  { id: "citadel", left: 588, top: 49, width: 91, height: 59, en: "Citadel" },
  { id: "dwelling_bronze", left: 696, top: 49, width: 91, height: 59, en: "Altars of Air and Water" },
  { id: "garden_of_life", left: 696, top: 110, width: 91, height: 55, en: "Garden of Life" }
];

for (const [fac, list] of [
  ["cove", COVE],
  ["conflux", CONFLUX]
]) {
  const board = path.join(ROOT, "final", `towns-${fac}-empty.webp`);
  const meta = await sharp(board).metadata();
  for (const c of list) {
    const region = {
      left: c.left,
      top: c.top,
      width: Math.min(c.width, meta.width - c.left),
      height: Math.min(c.height, meta.height - c.top)
    };
    const out = path.join(OUT, `${fac}-${c.id}.webp`);
    await sharp(board)
      .extract(region)
      .resize(region.width * 4, region.height * 4, { kernel: sharp.kernel.lanczos3 })
      .webp({ quality: 96 })
      .toFile(out);
    console.log(fac, c.id, `${region.width}x${region.height}`);
  }
  fs.writeFileSync(path.join(OUT, `${fac}-coords.json`), JSON.stringify(list, null, 2));
}

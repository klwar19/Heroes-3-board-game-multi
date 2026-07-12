#!/usr/bin/env node
import sharp from "sharp";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const GLYPHS = path.join(ROOT, "glyphs-ref");
const REPO = path.resolve(ROOT, "../..");

async function lighten(name, srcPath) {
  let svg = readFileSync(srcPath, "utf8");
  // Prefer parchment-gold monochrome on dark definition cards
  svg = svg
    .replace(/fill="(?!none)[^"]*"/g, 'fill="#e8d9a8"')
    .replace(/stroke="(?!none)[^"]*"/g, 'stroke="#c9b070"');
  if (!/fill=/.test(svg)) {
    svg = svg.replace("<svg", '<svg fill="#e8d9a8"');
  }
  await sharp(Buffer.from(svg))
    .resize(64, 64, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(GLYPHS, `${name}.png`));
  console.log("light", name);
}

// Spell from local card-glyphs (was near-black on dark panels)
await lighten("spell", path.join(REPO, "scripts/card-glyphs/spell.svg"));

// Keep resource glyphs in original color (gold/ore/crystal) — re-rasterize originals
for (const name of ["gold", "building_materials", "valuables", "1_valuables"]) {
  const p = path.join(GLYPHS, `${name}.svg`);
  if (!existsSync(p)) continue;
  await sharp(readFileSync(p))
    .resize(64, 64, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(GLYPHS, `${name}.png`));
}

// Effect icons: light parchment for dark cards
for (const name of [
  "artifact",
  "experience",
  "hand",
  "magic",
  "recruit",
  "reinforce",
  "building_city_hall",
  "building_citadel",
  "building_mage_guild"
]) {
  const p = path.join(GLYPHS, `${name}.svg`);
  if (existsSync(p)) await lighten(name, p);
}

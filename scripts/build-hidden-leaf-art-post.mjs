#!/usr/bin/env node
/**
 * Post-process Hidden Leaf Village art after Codex generation:
 *  1. Resize town panoramas to 1672×941 if needed
 *  2. Slice full panorama into 7 contiguous bar tiles (238 + 6×239)
 *  3. Build town icon from full panorama
 *  4. Crop specialty portraits for Naruto (Jinchuriki) and Sasuke (Jonin)
 *  5. Ensure unit cards are 743×1040 webp
 *  6. Ensure hero portraits are 1086×1448 png
 *  7. Ensure L-S1 tile is 1024×985 (match A-S1) with transparent-friendly margin
 *
 * Run after: powershell -File scripts/_codex-prompts/hidden-leaf-art-batch.ps1
 * Then:      node scripts/build-commander-cards.mjs might_guy
 *            node scripts/build-equipment-cards.mjs
 */

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = path.join(ROOT, "public", "assets");
const WEBP = { quality: 90, effort: 6 };

const PANO_W = 1672;
const PANO_H = 941;
// Match fuyuki / azure bar geometry exactly (sum = 1672).
const BAR_WIDTHS = [238, 239, 239, 239, 239, 239, 239];

async function ensureSize(rel, width, height, { format = "webp", cover = true } = {}) {
  const file = path.join(ASSETS, rel);
  const meta = await sharp(file).metadata();
  if (meta.width === width && meta.height === height) {
    console.log(`OK size ${width}x${height}\t${rel}`);
    return;
  }
  const pipeline = sharp(file).resize(width, height, {
    fit: cover ? "cover" : "fill",
    position: "centre"
  });
  if (format === "png") await pipeline.png().toFile(file + ".tmp");
  else await pipeline.webp(WEBP).toFile(file + ".tmp");
  const { rename } = await import("node:fs/promises");
  await rename(file + ".tmp", file);
  console.log(`RESIZED ${meta.width}x${meta.height} → ${width}x${height}\t${rel}`);
}

async function sliceBars() {
  const full = path.join(ASSETS, "anime/towns/hidden-leaf-village-full.webp");
  await ensureSize("anime/towns/hidden-leaf-village-full.webp", PANO_W, PANO_H, { cover: true });
  await ensureSize("anime/towns/hidden-leaf-village-empty.webp", PANO_W, PANO_H, { cover: true });

  const buf = await sharp(full).resize(PANO_W, PANO_H, { fit: "fill" }).png().toBuffer();
  let left = 0;
  for (let i = 0; i < 7; i++) {
    const w = BAR_WIDTHS[i];
    const out = path.join(ASSETS, `town-board/hidden-leaf-bar-${i + 1}.webp`);
    await mkdir(path.dirname(out), { recursive: true });
    await sharp(buf)
      .extract({ left, top: 0, width: w, height: PANO_H })
      .webp(WEBP)
      .toFile(out);
    console.log(`BAR ${i + 1} ${w}x${PANO_H}\t${path.relative(ROOT, out)}`);
    left += w;
  }
}

async function townIcon() {
  const source = path.join(ASSETS, "anime/towns/hidden-leaf-village-full.webp");
  const ICON_W = 174;
  const ICON_H = 137;
  const { width = PANO_W, height = PANO_H } = await sharp(source).metadata();
  const cropW = Math.min(width, Math.round(height * (ICON_W / ICON_H)));
  // Central gate / village core.
  const left = Math.min(Math.max(0, Math.round((width - cropW) / 2)), width - cropW);
  const out = path.join(ASSETS, "town-icon-hidden_leaf.webp");
  await sharp(source)
    .extract({ left, top: 0, width: cropW, height })
    .resize(ICON_W, ICON_H, { fit: "fill" })
    .webp(WEBP)
    .toFile(out);
  console.log(`ICON\t${path.relative(ROOT, out)}`);
}

async function specialtyPortraits() {
  const portraits = [
    [
      "anime/units/hidden-leaf/units-hidden-leaf-golden-jinchuriki-few.webp",
      "anime/units/portraits/hidden-leaf-jinchuriki.webp"
    ],
    [
      "anime/units/hidden-leaf/units-hidden-leaf-silver-jonin-few.webp",
      "anime/units/portraits/hidden-leaf-jonin.webp"
    ]
  ];
  for (const [source, name] of portraits) {
    const src = path.join(ASSETS, source);
    const out = path.join(ASSETS, name);
    await mkdir(path.dirname(out), { recursive: true });
    // Art window crop matching build-anime-town-icons.mjs (Fuyuki/Azure).
    await sharp(src)
      .extract({ left: 275, top: 165, width: 340, height: 375 })
      .resize(174, 192, { fit: "fill" })
      .webp(WEBP)
      .toFile(out);
    console.log(`PORTRAIT\t${path.relative(ROOT, out)}`);
  }
}

async function normalizeUnits() {
  const units = [
    "genin-squad",
    "medical-nin",
    "anbu",
    "jonin",
    "giant-toad",
    "jinchuriki",
    "susanoo"
  ];
  const tiers = {
    "genin-squad": "bronze",
    "medical-nin": "bronze",
    anbu: "bronze",
    jonin: "silver",
    "giant-toad": "silver",
    jinchuriki: "golden",
    susanoo: "golden"
  };
  for (const slug of units) {
    for (const side of ["few", "pack"]) {
      const rel = `anime/units/hidden-leaf/units-hidden-leaf-${tiers[slug]}-${slug}-${side}.webp`;
      await ensureSize(rel, 743, 1040, { cover: true });
    }
  }
}

async function normalizeHeroes() {
  for (const id of ["naruto", "sasuke", "tsunade"]) {
    await ensureSize(`anime/heroes/${id}.png`, 1086, 1448, { format: "png", cover: true });
  }
}

async function normalizeTile() {
  // Match A-S1 dimensions.
  await ensureSize("anime/tiles/l-s1.webp", 1024, 985, { cover: true });
}

async function normalizeEquipIcons() {
  for (const slug of ["shinobi_kunai_pouch", "body_flicker_tabi", "sage_chakra_charm"]) {
    const rel = `anime/equipment/${slug}.webp`;
    await ensureSize(rel, 512, 512, { cover: true });
  }
}

async function main() {
  await sliceBars();
  await townIcon();
  await normalizeUnits();
  await normalizeHeroes();
  await normalizeTile();
  await normalizeEquipIcons();
  try {
    await specialtyPortraits();
  } catch (err) {
    console.warn("specialty portraits deferred (units not ready yet):", err.message);
  }
  console.log("\nHidden Leaf post-process complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

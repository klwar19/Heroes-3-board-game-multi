#!/usr/bin/env node

// Derives the Adventure-Map style town ICON (public/assets/town-icon-<faction>.webp,
// the small square-ish capitol sprite every classic faction ships) for the two
// Anime Realms towns by cropping the citadel region out of their fully-built
// panoramas. Keeps TownIcon/townIconUrl on ONE convention for every faction.

import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(root, "public", "assets");

// Classic icons are 174x137; the panoramas are 1672x941. Crop a same-aspect
// window centred on each town's most distinctive architecture.
const ICON_W = 174;
const ICON_H = 137;

const towns = [
  // Fuyuki City: the central citadel/summoning court sits mid-frame.
  { faction: "fuyuki", source: "anime/towns/fuyuki-city-full.webp", left: 240 },
  // Azure Breeze Sect: the golden-core tower cluster right of centre.
  { faction: "azure_breeze", source: "anime/towns/azure-breeze-sect-full.webp", left: 320 },
  // Hidden Leaf Village: central gate / village core.
  { faction: "hidden_leaf", source: "anime/towns/hidden-leaf-village-full.webp", left: 260 }
];

for (const town of towns) {
  const input = path.join(assets, town.source);
  const { width = 1672, height = 941 } = await sharp(input).metadata();
  const cropW = Math.min(width, Math.round(height * (ICON_W / ICON_H)));
  const left = Math.min(Math.max(0, town.left), width - cropW);
  const output = path.join(assets, `town-icon-${town.faction}.webp`);
  await sharp(input)
    .extract({ left, top: 0, width: cropW, height })
    .resize(ICON_W, ICON_H, { fit: "fill" })
    .webp({ quality: 90, effort: 6 })
    .toFile(output);
  console.log(path.relative(root, output));
}

// Specialty-symbol portraits for the two anime unit-specialist heroes (Bin →
// Sabers, Qingyun → True Inheritors): a clean character crop out of the unit's
// own 743x1040 card art window, matching the classic 174x192 unit portraits
// (SPECIALTY_ICON_BY_HERO convention). Lives under assets/anime/ — the
// art-foundation guard keeps top-level units-fuyuki-*/units-azure-breeze-*
// names reserved for the (retired) proof sheets.
const portraits = [
  ["anime/units/fuyuki/units-fuyuki-golden-sabers-few.webp", "anime/units/portraits/fuyuki-sabers.webp"],
  [
    "anime/units/azure-breeze/units-azure-breeze-golden-true-inheritors-few.webp",
    "anime/units/portraits/azure-breeze-true-inheritors.webp"
  ],
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
  const output = path.join(assets, name);
  await sharp(path.join(assets, source))
    .extract({ left: 275, top: 165, width: 340, height: 375 })
    .resize(174, 192, { fit: "fill" })
    .webp({ quality: 90, effort: 6 })
    .toFile(output);
  console.log(path.relative(root, output));
}

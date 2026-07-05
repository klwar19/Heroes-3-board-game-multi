#!/usr/bin/env node

/**
 * Surgical stat/ability patcher for the five re-balanced WoG neutral cards.
 *
 * A full rebuild via build-placeholder-neutral-cards.mjs re-composites the unit
 * art over the frame, and the current ART_WIDTH lets that art spill over the
 * card's right-hand golden border — the committed WoG faces have a hand-correct
 * right border the template rebuild does not reproduce. So instead of rebuilding,
 * this script edits the committed .webp IN PLACE: it erases ONLY the stat
 * numerals that changed (re-using the build script's scanline-interpolation numeral
 * clean) and paints the new value back, and — where the printed rules changed —
 * repaints the ability panel (an opaque box, so it fully covers the old text).
 * Frame, art, cost and unchanged numerals are left byte-for-byte untouched.
 *
 * Run: node scripts/patch-wog-stat-numbers.mjs
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = path.join(ROOT, "public", "assets");
const GLYPHS = path.join(ROOT, "scripts", "card-glyphs");
const WEBP = { quality: 80, effort: 6 };
const CARD_WIDTH = 743;
const CARD_HEIGHT = 1040;

const g = (name) => ({ glyph: name });

// The four stat-cell numeral regions (build script cleanNeutralFrame), and the
// baseline y of each drawn value (build script statText). Index 0=attack,
// 1=defense, 2=health, 3=initiative.
const NUMBER_AREAS = [
  { left: 94, top: 260, width: 51, height: 54 },
  { left: 94, top: 427, width: 51, height: 60 },
  { left: 94, top: 582, width: 51, height: 64 },
  { left: 94, top: 768, width: 51, height: 58 }
];
const STAT_Y = [286, 456, 611, 795];

// Which cards to patch: file, the stat indices whose numeral changed with their
// new value, and (optionally) the new ability-panel lines + fontSize when the
// printed rules changed. Values mirror scripts/build-placeholder-neutral-cards.mjs.
const PATCHES = [
  {
    file: "units-neutral-silver-wog_war_zealot.webp",
    stats: [[0, 3]],
    fontSize: 16,
    lines: [
      [g("unit_passive"), " Ignore the penalty against adjacent units."],
      ["This unit always has Magic Mirror."],
      [g("unit_attack"), " When this unit attacks, it gains +1 ", g("attack"), "."]
    ]
  },
  {
    file: "units-neutral-silver-wog_arctic_sharpshooter.webp",
    stats: [[0, 3]]
  },
  {
    file: "units-neutral-silver-wog_lava_sharpshooter.webp",
    stats: [[0, 3], [2, 5]],
    fontSize: 16,
    lines: [
      [g("unit_passive"), " Ignore combat penalties."],
      ["An adjacent attacker takes 1 ", g("damage"), "."],
      [g("unit_attack"), " When this unit attacks, it gains +1 ", g("attack"), "."]
    ]
  },
  {
    file: "units-neutral-golden-wog_nightmare.webp",
    stats: [[2, 6]]
  },
  {
    file: "units-neutral-golden-wog_hell_steed.webp",
    stats: [[2, 7]]
  }
];

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function svgBuffer(body) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">${body}</svg>`
  );
}

function statValueText(index, value) {
  const size = String(value).length > 1 ? 29 : 34;
  return `<text x="119" y="${STAT_Y[index]}" text-anchor="middle" dominant-baseline="middle"
    font-family="Georgia, 'Times New Roman', serif" font-size="${size}" font-weight="700"
    fill="#fff4c8" stroke="#140c07" stroke-width="3" paint-order="stroke">${value}</text>`;
}

async function glyphDataUri(name) {
  const source = await readFile(path.join(GLYPHS, `${name}.svg`), "utf8");
  const tinted = source.replaceAll("currentColor", "#f0d56b");
  return `data:image/svg+xml;base64,${Buffer.from(tinted).toString("base64")}`;
}

function textWidth(text, fontSize) {
  return text.length * fontSize * 0.51;
}

// Adapted from build-placeholder-neutral-cards.mjs. ONE deviation: the opaque
// backing rect stops at x≈678 (PANEL_RIGHT), just short of the card's golden
// right border (which begins ~x680 in the committed faces), instead of the build
// script's full width to x710. The build path composites art over the frame and
// does not care, but here we edit the committed face in place — a full-width box
// would repaint over the golden right border in the panel band. Text stays
// centred at x=389 exactly as the build script draws it.
async function abilityPanel(card) {
  const top = 830;
  const height = 142;
  const PANEL_LEFT = 69;
  const PANEL_RIGHT = 678;
  const fontSize = card.fontSize ?? 21;
  const lineHeight = fontSize + 9;
  const firstY = 838 + (height - card.lines.length * lineHeight) / 2 + fontSize * 0.72;
  let body = `<rect x="${PANEL_LEFT}" y="${top}" width="${PANEL_RIGHT - PANEL_LEFT}" height="${height}" fill="#282019" fill-opacity="0.985" stroke="#8d683c" stroke-width="3"/>`;

  for (let lineIndex = 0; lineIndex < card.lines.length; lineIndex += 1) {
    const line = card.lines[lineIndex];
    const glyphSize = fontSize + 3;
    const widths = line.map((token) =>
      typeof token === "string" ? textWidth(token, fontSize) : glyphSize + 3
    );
    let x = 389 - widths.reduce((sum, width) => sum + width, 0) / 2;
    const y = firstY + lineIndex * lineHeight;

    for (let tokenIndex = 0; tokenIndex < line.length; tokenIndex += 1) {
      const token = line[tokenIndex];
      if (typeof token === "string") {
        body += `<text x="${x}" y="${y}" dominant-baseline="middle"
          font-family="Georgia, 'Times New Roman', serif" font-size="${fontSize}" font-weight="700"
          fill="#fff1c2" stroke="#160e08" stroke-width="1.4" paint-order="stroke">${escapeXml(token)}</text>`;
      } else {
        const href = await glyphDataUri(token.glyph);
        body += `<image href="${href}" x="${x}" y="${y - glyphSize / 2}" width="${glyphSize}" height="${glyphSize}" preserveAspectRatio="xMidYMid meet"/>`;
      }
      x += widths[tokenIndex];
    }
  }
  return body;
}

// Erase one stat numeral by interpolating leather texture across the removed
// pixels on each scanline — the same routine build script cleanNeutralFrame uses
// on the template, restricted here to a single changed stat cell.
function eraseNumeral(data, original, info, area) {
  const mask = new Uint8Array(info.width * info.height);
  for (let y = area.top; y < area.top + area.height; y += 1) {
    for (let x = area.left; x < area.left + area.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      const [r, green, b] = [original[offset], original[offset + 1], original[offset + 2]];
      if (r > 140 && green > 115 && b > 70) mask[y * info.width + x] = 1;
    }
  }
  for (let pass = 0; pass < 5; pass += 1) {
    const grown = mask.slice();
    for (let y = area.top; y < area.top + area.height; y += 1) {
      for (let x = area.left; x < area.left + area.width; x += 1) {
        if (!mask[y * info.width + x]) continue;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= area.left && nx < area.left + area.width && ny >= area.top && ny < area.top + area.height) {
            grown[ny * info.width + nx] = 1;
          }
        }
      }
    }
    mask.set(grown);
  }
  for (let y = area.top; y < area.top + area.height; y += 1) {
    for (let x = area.left; x < area.left + area.width; x += 1) {
      if (!mask[y * info.width + x]) continue;
      let left = x - 1;
      let right = x + 1;
      while (left >= area.left && mask[y * info.width + left]) left -= 1;
      while (right < area.left + area.width && mask[y * info.width + right]) right += 1;
      const target = (y * info.width + x) * info.channels;
      for (let channel = 0; channel < 3; channel += 1) {
        if (left >= area.left && right < area.left + area.width) {
          const a = original[(y * info.width + left) * info.channels + channel];
          const b = original[(y * info.width + right) * info.channels + channel];
          const t = (x - left) / (right - left);
          data[target + channel] = Math.round(a + (b - a) * t);
        } else {
          const sampleX = left >= area.left ? left : right;
          data[target + channel] = original[(y * info.width + sampleX) * info.channels + channel];
        }
      }
    }
  }
}

async function patchCard(patch) {
  const file = path.join(ASSETS, patch.file);
  const { data, info } = await sharp(file)
    .resize(CARD_WIDTH, CARD_HEIGHT, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const original = Buffer.from(data);

  // 1) Erase every changed numeral in the raw buffer.
  for (const [index] of patch.stats) {
    eraseNumeral(data, original, info, NUMBER_AREAS[index]);
  }
  const cleaned = await sharp(data, { raw: info }).png().toBuffer();

  // 2) Composite the new numerals (and repainted panel, if any) over the clean base.
  let overlayBody = patch.stats.map(([index, value]) => statValueText(index, value)).join("");
  if (patch.lines) overlayBody += await abilityPanel({ lines: patch.lines, fontSize: patch.fontSize });

  await sharp(cleaned)
    .composite([{ input: svgBuffer(overlayBody) }])
    .webp(WEBP)
    .toFile(file);
  return patch.file;
}

for (const patch of PATCHES) {
  const done = await patchCard(patch);
  console.log("patched", done);
}

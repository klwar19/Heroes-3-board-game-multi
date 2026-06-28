#!/usr/bin/env node

/**
 * Build original Cannon and Catapult faces for the war-machine cards that are
 * deck-back/placeholders on en.homm3bg.wiki.
 *
 * Generated artwork is confined to the illustration window. The outer frame
 * and market icon row come from the real First Aid Tent card, while titles,
 * prices, rules, and legend glyphs are composed deterministically.
 */

import { readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = path.join(ROOT, "public", "assets");
// Glyphs live in scripts/card-glyphs — the same directory every other card
// build script (creature-bank, placeholder-neutral, missing-spell) reads from.
const GLYPHS = path.join(ROOT, "scripts", "card-glyphs");

// Lossy WebP at quality 94 — the repo standard for every committed card face
// (see build-creature-bank-unit-cards.mjs). The source illustrations are
// themselves lossy ~q94, so the card loses no visible quality.
const WEBP_QUALITY = 94;

const CARD_WIDTH = 743;
const CARD_HEIGHT = 1040;
const GOLD = "#eadb8f";
const LIGHT = "#eee5c8";
const DARK = "#2d211a";

const CARDS = [
  {
    slug: "cannon",
    title: "Cannon",
    art: "war_machines-cannon-art.webp",
    factoryCost: 10,
    tradingPostCost: 14,
    seed: 421,
    text: [
      { x: 146, y: 856, value: "At the beginning of each Combat round," },
      { x: 103, y: 903, value: "you can spend 1" },
      { x: 320, y: 903, value: "to deal 2" },
      { x: 463, y: 903, value: "to 1 enemy unit." },
    ],
    glyphs: [
      { name: "permanent", left: 84, top: 841, width: 50, height: 25 },
      { name: "expert", left: 278, top: 884, width: 31, height: 29 },
      { name: "damage", left: 424, top: 882, width: 31, height: 31 },
    ],
  },
  {
    slug: "catapult",
    title: "Catapult",
    art: "war_machines-catapult-art.webp",
    factoryCost: 8,
    tradingPostCost: 12,
    seed: 509,
    fontSize: 21,
    text: [
      { x: 146, y: 841, value: "At the beginning of each Combat round," },
      { x: 86, y: 878, value: "you may pay 1" },
      { x: 272, y: 878, value: "to choose 2 adjacent targets" },
      {
        x: 371.5,
        y: 916,
        value: "(any combination of units, Walls and the Gate)",
        anchor: "middle",
        size: 19,
      },
      { x: 151, y: 954, value: "and deal 1" },
      { x: 296, y: 954, value: "to each of them." },
    ],
    glyphs: [
      { name: "permanent", left: 84, top: 826, width: 50, height: 25 },
      {
        name: "building_materials",
        left: 231,
        top: 859,
        width: 32,
        height: 32,
        tint: null,
      },
      { name: "damage", left: 255, top: 936, width: 31, height: 31 },
    ],
  },
];

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** A softly mottled leather patch that hides the template card's old copy. */
function leatherPatch(width, height, rgb, seed, feather = 3) {
  const random = mulberry32(seed);
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const grain = Math.round((random() - 0.5) * 12);
      const mottling = Math.round(
        3 * Math.sin(x / 24 + seed) + 2 * Math.sin(y / 31 + seed / 4),
      );
      const vignette = Math.round(
        ((x / width - 0.5) ** 2 + (y / height - 0.5) ** 2) * -8,
      );
      for (let channel = 0; channel < 3; channel += 1) {
        pixels[index + channel] = Math.max(
          0,
          Math.min(255, rgb[channel] + grain + mottling + vignette),
        );
      }
      const edge = Math.min(x, y, width - 1 - x, height - 1 - y);
      pixels[index + 3] =
        feather === 0 ? 255 : Math.round(255 * Math.min(1, edge / feather));
    }
  }
  return { input: pixels, raw: { width, height, channels: 4 } };
}

async function preparedArt(source) {
  return sharp(source)
    .resize(611, 569, { fit: "cover", position: "centre" })
    .modulate({ saturation: 0.94, brightness: 0.96 })
    .sharpen({ sigma: 0.45 })
    .webp({ quality: WEBP_QUALITY, effort: 6 })
    .toBuffer();
}

async function glyphBuffer(name, width, height, tint = GOLD) {
  let source = await readFile(path.join(GLYPHS, `${name}.svg`), "utf8");
  if (tint !== null) source = source.replaceAll("currentColor", tint);
  return sharp(Buffer.from(source))
    .resize(width, height, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .png()
    .toBuffer();
}

function textOverlay(card) {
  const titleSize = card.title.length > 7 ? 51 : 56;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
    <g font-family="Georgia, 'Times New Roman', serif" paint-order="stroke" stroke="${DARK}" stroke-width="3" fill="${LIGHT}" dominant-baseline="middle">
      <text x="371.5" y="112" text-anchor="middle" font-size="${titleSize}" font-weight="700" fill="${GOLD}">${escapeXml(card.title)}</text>
      <text x="332" y="773" text-anchor="middle" font-size="31" font-weight="700" fill="${GOLD}">${card.factoryCost}</text>
      <text x="638" y="773" text-anchor="middle" font-size="31" font-weight="700" fill="${GOLD}">${card.tradingPostCost}</text>
      ${card.text
        .map(
          (line) =>
            `<text x="${line.x}" y="${line.y}" text-anchor="${line.anchor ?? "start"}" font-size="${line.size ?? card.fontSize ?? 23}" font-weight="700">${escapeXml(line.value)}</text>`,
        )
        .join("\n")}
    </g>
  </svg>`);
}

async function glyphLayers(card) {
  return Promise.all(
    card.glyphs.map(async ({ name, left, top, width, height, tint }) => ({
      input: await glyphBuffer(
        name,
        width,
        height,
        tint === null ? null : GOLD,
      ),
      left,
      top,
    })),
  );
}

async function buildCard(card) {
  const art = await preparedArt(path.join(ASSETS, card.art));
  const glyphs = await glyphLayers(card);
  const destination = path.join(ASSETS, `war_machines-${card.slug}.webp`);
  const temporary = `${destination}.tmp.webp`;

  await sharp(path.join(ASSETS, "war_machines-first_aid_tent.webp"))
    .resize(CARD_WIDTH, CARD_HEIGHT, { fit: "fill" })
    .composite([
      {
        ...leatherPatch(609, 88, [65, 45, 35], card.seed, 4),
        left: 67,
        top: 67,
      },
      { input: art, left: 66, top: 161 },
      {
        ...leatherPatch(45, 49, [59, 42, 33], card.seed + 1, 2),
        left: 310,
        top: 744,
      },
      {
        ...leatherPatch(55, 49, [59, 42, 33], card.seed + 2, 2),
        left: 611,
        top: 744,
      },
      {
        ...leatherPatch(609, 169, [40, 29, 24], card.seed + 3, 4),
        left: 67,
        top: 813,
      },
      { input: textOverlay(card) },
      ...glyphs,
    ])
    .webp({ quality: WEBP_QUALITY, effort: 6 })
    .toFile(temporary);

  await rm(destination, { force: true });
  await rename(temporary, destination);
  return destination;
}

for (const card of CARDS) {
  const output = await buildCard(card);
  console.log(path.relative(ROOT, output));
}

#!/usr/bin/env node

/**
 * Build the four art-less Conflux Summon Elemental spell cards.
 *
 * The outer card, power ladder, and universal "+1 Power" discard row come
 * from an existing Expert spell in the same school. Generated, text-free art
 * is then combined with deterministic typography so rules text is never left
 * to an image model.
 */

import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = path.join(ROOT, "public", "assets");
const OUT = path.join(ROOT, "out");
// Source elemental art (build input only — kept out of public/ so it is never served).
const ART_SRC = path.join(ROOT, "scripts", "summon-art");

const CARD_WIDTH = 743;
const CARD_HEIGHT = 1040;

const SPELLS = [
  {
    slug: "air",
    element: "Air",
    template: "spells-chain_lightning.webp",
    art: "air-elemental.webp",
    paper: [139, 101, 81],
    seed: 11
  },
  {
    slug: "earth",
    element: "Earth",
    template: "spells-town_portal.webp",
    art: "earth-elemental.webp",
    paper: [137, 100, 81],
    seed: 23
  },
  {
    slug: "fire",
    element: "Fire",
    template: "spells-slayer.webp",
    art: "fire-elemental.webp",
    paper: [139, 100, 80],
    seed: 37
  },
  {
    slug: "water",
    element: "Water",
    template: "spells-prayer.webp",
    art: "water-elemental.webp",
    paper: [137, 101, 83],
    seed: 53
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

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function paperPatch(width, height, rgb, seed, feather = 14) {
  const random = mulberry32(seed);
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const grain = Math.round((random() - 0.5) * 9);
      const mottling = Math.round(3 * Math.sin(x / 31 + seed) + 2 * Math.sin(y / 47 + seed / 3));
      const shade = Math.round(((x / width - 0.5) ** 2 + (y / height - 0.5) ** 2) * -7);
      pixels[index] = Math.max(0, Math.min(255, rgb[0] + grain + mottling + shade));
      pixels[index + 1] = Math.max(0, Math.min(255, rgb[1] + grain + mottling + shade));
      pixels[index + 2] = Math.max(0, Math.min(255, rgb[2] + grain + mottling + shade));
      const edge = Math.min(x, y, width - 1 - x, height - 1 - y);
      const alpha = feather === 0 ? 255 : Math.round(255 * Math.min(1, edge / feather));
      pixels[index + 3] = alpha;
    }
  }
  return { input: pixels, raw: { width, height, channels: 4 } };
}

async function preparedArt(source) {
  const size = 374;
  const image = await sharp(source)
    .resize(size, size, { fit: "cover", position: "centre" })
    .ensureAlpha()
    .png()
    .toBuffer();
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <defs><radialGradient id="fade" cx="50%" cy="48%" r="58%">
      <stop offset="0%" stop-color="white" stop-opacity="1"/>
      <stop offset="55%" stop-color="white" stop-opacity="1"/>
      <stop offset="100%" stop-color="white" stop-opacity="0"/>
    </radialGradient></defs>
    <rect width="100%" height="100%" fill="url(#fade)"/>
  </svg>`);
  return sharp(image).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

function airOrnaments() {
  return `<g fill="#ece7dc" stroke="#c8c1b4" stroke-width="2" opacity=".95">
    <defs><g id="airMark"><circle cx="0" cy="3" r="19"/><circle cx="22" cy="-7" r="25"/><circle cx="49" cy="2" r="20"/>
      <path d="M-17 16c25 11 57 11 88-1-24 25-58 29-88 1z"/>
      <path d="M-12 29c25 12 54 9 70-6" fill="none" stroke-width="8" stroke-linecap="round"/></g></defs>
    <use href="#airMark" transform="translate(124 176) scale(.9)"/>
    <use href="#airMark" transform="translate(619 176) scale(-.9 .9)"/>
    <use href="#airMark" transform="translate(124 401) scale(.9 -.9)"/>
    <use href="#airMark" transform="translate(619 401) scale(-.9 -.9)"/>
  </g>`;
}

function earthOrnaments() {
  return `<g stroke="#355022" stroke-width="4" stroke-linecap="round" opacity=".96">
    <defs><g id="earthMark"><path d="M-18 27c22-9 36-25 43-48M17 9c18-1 33 5 47 20" fill="none"/>
      <ellipse cx="-7" cy="9" rx="16" ry="28" transform="rotate(-45 -7 9)" fill="#6c9142"/>
      <ellipse cx="24" cy="-14" rx="17" ry="29" transform="rotate(28 24 -14)" fill="#77a14c"/>
      <ellipse cx="49" cy="16" rx="15" ry="27" transform="rotate(50 49 16)" fill="#5f8538"/></g></defs>
    <use href="#earthMark" transform="translate(119 176) scale(.9)"/>
    <use href="#earthMark" transform="translate(624 176) scale(-.9 .9)"/>
    <use href="#earthMark" transform="translate(119 402) scale(.9 -.9)"/>
    <use href="#earthMark" transform="translate(624 402) scale(-.9 -.9)"/>
  </g>`;
}

function fireOrnaments() {
  return `<g stroke="#8d3421" stroke-width="3" opacity=".97">
    <defs><g id="fireMark"><path d="M0 52c-8-34 15-40 9-72 20 13 20 32 18 43 9-10 16-24 10-40 27 22 32 50 10 72-18 18-39 11-47-3z" fill="#ef6a31"/>
      <path d="M14 46c-3-19 9-25 13-38 12 12 16 28 6 43-8 11-16 6-19-5z" fill="#f5b03a" stroke="none"/></g></defs>
    <use href="#fireMark" transform="translate(106 154) scale(1.15)"/>
    <use href="#fireMark" transform="translate(637 154) scale(-1.15 1.15)"/>
    <use href="#fireMark" transform="translate(106 424) scale(1.15 -1.15)"/>
    <use href="#fireMark" transform="translate(637 424) scale(-1.15 -1.15)"/>
  </g>`;
}

function waterOrnaments() {
  return `<g opacity=".96">
    <defs><g id="waterMark"><path d="M-4 26c14-42 54-49 73-7-25-16-50-15-73 7z" fill="#d3b16f" stroke="#795c3e" stroke-width="3"/>
      <path d="M4 18L30-8M18 14L38-10M34 13L45-6M49 17L51 0" stroke="#836744" stroke-width="3"/>
      <path d="M-8 34c22 13 48 13 71-1 11-7 20-6 29 2-13 8-21 20-24 34" fill="none" stroke="#394e91" stroke-width="7" stroke-linecap="round"/></g></defs>
    <use href="#waterMark" transform="translate(105 157) scale(.95)"/>
    <use href="#waterMark" transform="translate(638 157) scale(-.95 .95)"/>
    <use href="#waterMark" transform="translate(105 423) scale(.95 -.95)"/>
    <use href="#waterMark" transform="translate(638 423) scale(-.95 -.95)"/>
  </g>`;
}

function ornamentSvg(school) {
  if (school === "air") return airOrnaments();
  if (school === "earth") return earthOrnaments();
  if (school === "fire") return fireOrnaments();
  return waterOrnaments();
}

function textOverlay(spell) {
  const element = escapeXml(spell.element);
  const title = `Summon ${element} Elemental`;
  const titleSize = spell.element === "Earth" || spell.element === "Water" ? 38 : 40;
  const rowSize = spell.element === "Earth" || spell.element === "Water" ? 18 : 19;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
    <g fill="none" stroke="#614737" stroke-width="2" opacity=".18">
      <path d="M82 132c84-42 118-11 98 38-18 43-3 70 42 78M661 132c-84-42-118-11-98 38 18 43 3 70-42 78"/>
      <path d="M85 455c77 24 107 7 92-39M658 455c-77 24-107 7-92-39"/>
      <path d="M76 583c96-44 164-42 231 5M667 583c-96-44-164-42-231 5"/>
    </g>
    ${ornamentSvg(spell.slug)}
    <g font-family="Georgia, 'Times New Roman', serif" paint-order="stroke" stroke="#4a3424" stroke-width="3">
      <text x="371.5" y="82" text-anchor="middle" dominant-baseline="middle" font-size="${titleSize}" font-weight="700" fill="#e8d27b">${title}</text>
      <path d="M62 526h26l-8-9 8-9H62l-11 9z" fill="#e8d77c" stroke-width="2"/>
      <text x="390" y="529" text-anchor="middle" dominant-baseline="middle" font-size="28" font-weight="700" fill="#eee5c8">On a chosen empty space:</text>
      <g fill="none" stroke="#c8aa65" stroke-width="2">
        <circle cx="251" cy="735" r="60"/>
        <path d="M307 704h58M311 735h54M307 766h58"/>
        <circle cx="391" cy="671" r="24"/><circle cx="391" cy="735" r="24"/><circle cx="391" cy="799" r="24"/>
      </g>
      <g transform="translate(211 704)" fill="#d9c46d" stroke="#5b432a" stroke-width="3">
        <path d="M0 12c15-6 28-4 40 5 12-9 25-11 40-5v48c-15-5-28-3-40 7-12-10-25-12-40-7z"/>
        <path d="M40 17v50" fill="none"/>
        <path d="M18 18l8 7 7-13 8 13 8-7 5 19H13z"/>
      </g>
      <g fill="#e8dcc0" font-size="23" text-anchor="middle" dominant-baseline="middle">
        <text x="391" y="671">0:</text><text x="391" y="735">2:</text><text x="391" y="799">4:</text>
      </g>
      <text x="438" y="671" font-size="23" fill="#eee5c8">No effect</text>
      <text x="438" y="735" font-size="${rowSize}" fill="#eee5c8">Summon a Few ${element} Elementals</text>
      <text x="438" y="799" font-size="${rowSize}" fill="#eee5c8">Summon a Pack of ${element} Elementals</text>
    </g>
  </svg>`);
}

async function buildCard(spell) {
  const template = path.join(ASSETS, spell.template);
  const art = await preparedArt(path.join(ART_SRC, spell.art));
  const destination = path.join(ASSETS, `spells-summon_${spell.slug}_elemental.webp`);
  const temporary = `${destination}.tmp.webp`;

  await sharp(template)
    .resize(CARD_WIDTH, CARD_HEIGHT, { fit: "fill" })
    .composite([
      { ...paperPatch(543, 85, spell.paper, spell.seed, 10), left: 100, top: 33 },
      { ...paperPatch(666, 363, spell.paper, spell.seed + 1, 0), left: 39, top: 106 },
      { ...paperPatch(666, 179, spell.paper, spell.seed + 2, 0), left: 39, top: 466 },
      { ...paperPatch(666, 240, spell.paper, spell.seed + 3, 0), left: 39, top: 610 },
      { input: art, left: 185, top: 102 },
      { input: textOverlay(spell) }
    ])
    .webp({ quality: 82, effort: 6 })
    .toFile(temporary);
  await rm(destination, { force: true });
  await rename(temporary, destination);
  return destination;
}

await mkdir(ASSETS, { recursive: true });
await mkdir(OUT, { recursive: true });

const outputs = [];
for (const spell of SPELLS) outputs.push(await buildCard(spell));

const previewWidth = 372;
const previewHeight = 520;
const gap = 12;
const previews = await Promise.all(
  outputs.map((output) => sharp(output).resize(previewWidth, previewHeight, { fit: "fill" }).png().toBuffer())
);
await sharp({
  create: {
    width: previewWidth * 2 + gap,
    height: previewHeight * 2 + gap,
    channels: 4,
    background: "#15110f"
  }
})
  .composite(
    previews.map((input, index) => ({
      input,
      left: (index % 2) * (previewWidth + gap),
      top: Math.floor(index / 2) * (previewHeight + gap)
    }))
  )
  .png()
  .toFile(path.join(OUT, "summon-spell-cards-contact-sheet.png"));

for (const output of outputs) console.log(path.relative(ROOT, output));

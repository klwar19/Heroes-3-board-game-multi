#!/usr/bin/env node

/**
 * Build the four Basic <School> Magic ability faces whose wiki pages expose
 * only the player-deck back.
 *
 * The matching printed <School> Magic card supplies the authentic ability
 * frame and expert divider. Generated art is confined to the illustration
 * area; title, rules, and every symbolic rules reference are composed
 * deterministically from the wiki legend glyphs.
 *
 * !! STALE AS OF 2026-08-04 — DO NOT RE-RUN BLINDLY !!
 * The premise in the first paragraph above ("wiki pages expose only the
 * player-deck back") is NO LONGER TRUE. en.homm3bg.wiki now publishes the
 * GENUINE printed scans for all four cards (CONFLUX 034-037/080) at
 * https://en.homm3bg.wiki/assets/abilities-basic_<school>_magic.webp, and those
 * real scans are what is committed in public/assets today. Re-running this
 * script would OVERWRITE the printed cards with the generated composites.
 * If you ever do, restore them with:
 *   py scripts/fetch-wiki-art-round3.py
 */

import { mkdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = path.join(ROOT, "public", "assets");
const GLYPHS = path.join(ROOT, "scripts", "card-glyphs");
const OUT = path.join(ROOT, "out");

const CARD_WIDTH = 743;
const CARD_HEIGHT = 1040;
const GOLD = "#eadb8f";
const LIGHT = "#eee5c8";
const DARK = "#2d211a";
const WEBP_QUALITY = 80;

const CARDS = [
  { slug: "air", school: "Air", seed: 211 },
  { slug: "earth", school: "Earth", seed: 307 },
  { slug: "fire", school: "Fire", seed: 401 },
  { slug: "water", school: "Water", seed: 503 }
];

const glyph = (name) => ({ glyph: name });

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

/** A feathered, softly mottled leather patch that hides the template copy. */
function leatherPatch(width, height, rgb, seed, feather = 4) {
  const random = mulberry32(seed);
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const grain = Math.round((random() - 0.5) * 13);
      const mottling = Math.round(
        3 * Math.sin(x / 27 + seed) + 2 * Math.sin(y / 33 + seed / 5)
      );
      const vignette = Math.round(
        ((x / width - 0.5) ** 2 + (y / height - 0.5) ** 2) * -7
      );
      for (let channel = 0; channel < 3; channel += 1) {
        pixels[index + channel] = Math.max(
          0,
          Math.min(255, rgb[channel] + grain + mottling + vignette)
        );
      }
      const edge = Math.min(x, y, width - 1 - x, height - 1 - y);
      pixels[index + 3] = Math.round(255 * Math.min(1, edge / feather));
    }
  }
  return { input: pixels, raw: { width, height, channels: 4 } };
}

async function glyphDataUri(name) {
  const source = (await readFile(path.join(GLYPHS, `${name}.svg`), "utf8"))
    .replaceAll("currentColor", GOLD);
  return `data:image/svg+xml;base64,${Buffer.from(source).toString("base64")}`;
}

function approximateTextWidth(text, fontSize) {
  return text.length * fontSize * 0.49;
}

/**
 * Render a centred line containing both copy and exact wiki legend glyphs.
 * Glyph tokens replace their words, so the card never prints redundant labels
 * such as "Permanent", "Spell", or "Power" beside a symbol.
 */
async function inlineLine(tokens, y, fontSize = 23) {
  const prepared = await Promise.all(
    tokens.map(async (token) => {
      if (typeof token === "string") {
        return { kind: "text", value: token, width: approximateTextWidth(token, fontSize) };
      }
      const height = token.glyph === "permanent" ? fontSize + 5 : fontSize + 8;
      const width = token.glyph === "permanent" ? height * 1.45 : height;
      return { kind: "glyph", href: await glyphDataUri(token.glyph), width, height };
    })
  );
  const gap = 4;
  const totalWidth = prepared.reduce((sum, token) => sum + token.width, 0) + gap * (prepared.length - 1);
  let x = CARD_WIDTH / 2 - totalWidth / 2;
  const body = [];
  for (const token of prepared) {
    if (token.kind === "text") {
      body.push(
        `<text x="${x}" y="${y}" font-size="${fontSize}" text-anchor="start">${escapeXml(token.value)}</text>`
      );
    } else {
      body.push(
        `<image href="${token.href}" x="${x}" y="${y - token.height / 2}" width="${token.width}" height="${token.height}" preserveAspectRatio="xMidYMid meet"/>`
      );
    }
    x += token.width + gap;
  }
  return body.join("\n");
}

async function textOverlay(card) {
  const regularLines = [
    [glyph("permanent"), "Instead of Searching the Spell deck,"],
    [`find the first ${card.school} Magic `, glyph("spell"), " in it and"],
    ["take the ", glyph("spell"), " into your hand."],
    ["Then, reshuffle the deck."]
  ];
  const regularYs = [505, 541, 577, 613];
  const regular = await Promise.all(
    regularLines.map((line, index) => inlineLine(line, regularYs[index], 22))
  );
  // "an Air"/"an Earth" but "a Fire"/"a Water": derive from the leading vowel.
  const article = /^[aeiou]/i.test(card.slug) ? "an" : "a";
  const expert = await inlineLine(
    [glyph("instant"), "+3 ", glyph("power"), ` for ${article} ${card.school} Magic `, glyph("spell"), "."],
    867,
    25
  );
  const title = `Basic ${card.school} Magic`;
  const titleSize = title.length > 16 ? 40 : 43;

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
    <g font-family="Georgia, 'Times New Roman', serif" paint-order="stroke" stroke="${DARK}" stroke-width="3" fill="${LIGHT}" dominant-baseline="middle" font-weight="700">
      <text x="371.5" y="425" text-anchor="middle" font-size="${titleSize}" fill="${GOLD}">${escapeXml(title)}</text>
      ${regular.join("\n")}
      ${expert}
    </g>
  </svg>`);
}

/** Fade the generated illustration into the leather instead of leaving a box. */
async function preparedArt(source) {
  const width = 470;
  const height = 330;
  const image = await sharp(source)
    .resize(width, height, { fit: "cover", position: "centre" })
    .modulate({ saturation: 0.94, brightness: 0.91 })
    .sharpen({ sigma: 0.4 })
    .png()
    .toBuffer();
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><radialGradient id="fade" cx="50%" cy="50%" r="66%">
      <stop offset="0%" stop-color="white" stop-opacity="1"/>
      <stop offset="70%" stop-color="white" stop-opacity="1"/>
      <stop offset="100%" stop-color="white" stop-opacity="0"/>
    </radialGradient></defs>
    <rect width="100%" height="100%" fill="url(#fade)"/>
  </svg>`);
  return sharp(image)
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

async function buildCard(card) {
  const template = path.join(ASSETS, `abilities-${card.slug}_magic.webp`);
  const artSource = path.join(ASSETS, `abilities-basic_${card.slug}_magic-art.webp`);
  const destination = path.join(ASSETS, `abilities-basic_${card.slug}_magic.webp`);
  const temporary = `${destination}.tmp.webp`;
  const art = await preparedArt(artSource);
  const copy = await textOverlay(card);

  await sharp(template)
    .resize(CARD_WIDTH, CARD_HEIGHT, { fit: "fill" })
    .composite([
      { ...leatherPatch(615, 638, [65, 44, 34], card.seed), left: 64, top: 67 },
      { ...leatherPatch(615, 187, [58, 40, 32], card.seed + 1), left: 64, top: 785 },
      { input: art, left: 136, top: 73 },
      { input: copy }
    ])
    .webp({ quality: WEBP_QUALITY, effort: 6 })
    .toFile(temporary);

  await rm(destination, { force: true });
  await rename(temporary, destination);
  return destination;
}

await mkdir(OUT, { recursive: true });
const outputs = [];
for (const card of CARDS) {
  outputs.push(await buildCard(card));
}

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
    background: "#16100c"
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
  .toFile(path.join(OUT, "basic-magic-ability-cards-contact-sheet.png"));

for (const output of outputs) {
  console.log(path.relative(ROOT, output));
}

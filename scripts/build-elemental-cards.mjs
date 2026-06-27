#!/usr/bin/env node

/**
 * Build the twelve Air/Earth/Fire/Water Elemental card faces.
 *
 * Each creature has one shared 540x594 art panel. The Few, Pack, and Neutral
 * cards composite that exact panel into different official card frames, then
 * add the statistics and rules text transcribed from en.homm3bg.wiki.
 *
 * The first run can prepare the shared art panels from the ignored
 * out/elemental-card-sources/<element>-elemental-art.png files. Once the four
 * WebP panels exist in public/assets, later runs are fully self-contained.
 */

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = path.join(ROOT, "public", "assets");
const GENERATED_SOURCES = path.join(ROOT, "out", "elemental-card-sources");

const CARD_WIDTH = 743;
const CARD_HEIGHT = 1038;
const ART_WIDTH = 540;
const ART_HEIGHT = 594;
const ART_LEFT = 169;

const ELEMENTALS = [
  {
    slug: "air",
    name: "Air Elementals",
    school: "Air",
    neutralTier: "bronze",
    few: [2, 0, 4, 8],
    pack: [3, 0, 4, 8],
    neutral: [2, 0, 3, 7],
    neutralCost: 7
  },
  {
    slug: "earth",
    name: "Earth Elementals",
    school: "Earth",
    neutralTier: "golden",
    few: [2, 2, 2, 5],
    pack: [3, 2, 2, 5],
    neutral: [3, 2, 5, 4],
    neutralCost: 16
  },
  {
    slug: "fire",
    name: "Fire Elementals",
    school: "Fire",
    neutralTier: "silver",
    few: [2, 1, 4, 5],
    pack: [3, 1, 4, 5],
    neutral: [3, 1, 3, 6],
    neutralCost: 13
  },
  {
    slug: "water",
    name: "Water Elementals",
    school: "Water",
    neutralTier: "silver",
    few: [2, 0, 5, 6],
    pack: [3, 0, 5, 6],
    neutral: [2, 1, 4, 5],
    neutralCost: 10
  }
];

const NEUTRAL_TEMPLATES = {
  bronze: "units-neutral-bronze-gremlins.webp",
  silver: "units-neutral-silver-zealots.webp",
  golden: "units-neutral-golden-nagas.webp"
};

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

function titleText(name) {
  const size = name.length > 17 ? 39 : 44;
  return `<text x="385" y="109" text-anchor="middle" dominant-baseline="middle"
    font-family="Georgia, 'Times New Roman', serif" font-size="${size}" font-weight="700"
    fill="#f6e7a6" stroke="#170f09" stroke-width="3" paint-order="stroke">${escapeXml(name)}</text>`;
}

function groundIcon() {
  // A compact gold boot/step mark, used in the same top-left position as the
  // official unit-type glyphs. It remains deliberately simple at card size.
  return `<g transform="translate(185 178)" fill="#f5e77e" stroke="#4c3a14" stroke-width="2">
    <path d="M8 8h17v15l13 8c6 4 8 9 6 15H7c-5 0-7-4-5-9l6-11z"/>
    <path d="M4 47h42v7H4z"/>
  </g>`;
}

function statText(stats, variant) {
  const ys = variant === "neutral" ? [286, 441, 596, 750] : [273, 422, 570, 719];
  const neutralPatchBoxes = [
    [249, 72],
    [404, 76],
    [558, 80],
    [712, 94]
  ];
  const patches = ys
    .map((y, index) => {
      const [top, height] =
        variant === "neutral" ? neutralPatchBoxes[index] : [y - 27, 48];
      return `<rect x="86" y="${top}" width="66" height="${height}" rx="5" fill="#372317" fill-opacity="0.99"/>`;
    })
    .join("");
  const labels = stats
    .map(
      (value, index) =>
        `<text x="119" y="${ys[index]}" text-anchor="middle" dominant-baseline="middle"
          font-family="Georgia, 'Times New Roman', serif" font-size="34" font-weight="700"
          fill="#fff4c8" stroke="#140c07" stroke-width="3" paint-order="stroke">${value}</text>`
    )
    .join("");
  return patches + labels;
}

function abilityPanel(school, variant) {
  const top = variant === "neutral" ? 820 : 858;
  const height = variant === "neutral" ? 157 : 120;
  const lines = [
    "Immune to Magic Arrow and",
    `${school} Magic spells. This unit`,
    "deals elemental damage."
  ];
  const firstY = variant === "neutral" ? 866 : 882;
  return `
    <rect x="69" y="${top}" width="641" height="${height}" fill="#282019" fill-opacity="0.98" stroke="#8d683c" stroke-width="3"/>
    <path d="M91 ${firstY - 8}h17l-5-6 5-6h-17l-7 12z" fill="#f0d56b" stroke="#3c2c13" stroke-width="2"/>
    ${lines
      .map(
        (line, index) =>
          `<text x="390" y="${firstY + index * 31}" text-anchor="middle" dominant-baseline="middle"
            font-family="Georgia, 'Times New Roman', serif" font-size="23" font-weight="700"
            fill="#fff1c2" stroke="#160e08" stroke-width="2" paint-order="stroke">${escapeXml(line)}</text>`
      )
      .join("")}`;
}

function fewCostPanel() {
  return `
    <text x="326" y="807" text-anchor="middle" dominant-baseline="middle"
      font-family="Georgia, 'Times New Roman', serif" font-size="38" font-weight="700"
      fill="#fff2c4" stroke="#170e08" stroke-width="3" paint-order="stroke">—</text>
    <text x="623" y="807" text-anchor="middle" dominant-baseline="middle"
      font-family="Georgia, 'Times New Roman', serif" font-size="38" font-weight="700"
      fill="#fff2c4" stroke="#170e08" stroke-width="3" paint-order="stroke">—</text>`;
}

function packPanel() {
  return `
    <rect x="69" y="757" width="641" height="101" fill="#3a281b" stroke="#9e7544" stroke-width="3"/>
    <text x="389" y="808" text-anchor="middle" dominant-baseline="middle"
      font-family="Georgia, 'Times New Roman', serif" font-size="42" font-weight="700"
      fill="#f0d56b" stroke="#150d08" stroke-width="3" paint-order="stroke"># PACK</text>`;
}

function neutralCost(cost) {
  return `
    <rect x="474" y="766" width="158" height="50" rx="4" fill="#50472d" fill-opacity="0.99"/>
    <text x="542" y="793" text-anchor="middle" dominant-baseline="middle"
      font-family="Georgia, 'Times New Roman', serif" font-size="33" font-weight="700"
      fill="#fff2c4" stroke="#160e08" stroke-width="3" paint-order="stroke">${cost}</text>`;
}

async function ensureSharedArt(element) {
  const destination = path.join(ASSETS, `units-elemental-art-${element.slug}.webp`);
  if (existsSync(destination)) {
    return destination;
  }

  const source = path.join(GENERATED_SOURCES, `${element.slug}-elemental-art.png`);
  if (!existsSync(source)) {
    throw new Error(
      `Missing ${destination} and source ${source}. Restore the generated source PNG before the first build.`
    );
  }

  await sharp(source)
    .resize(ART_WIDTH, ART_HEIGHT, { fit: "cover", position: "centre" })
    .webp({ quality: 94, effort: 6 })
    .toFile(destination);
  return destination;
}

async function cleanTitlePatch(tier) {
  const blank = path.join(ASSETS, `units-blank-${tier}.webp`);
  return sharp(blank)
    .resize(CARD_WIDTH, CARD_HEIGHT, { fit: "fill" })
    .extract({ left: 49, top: 40, width: 675, height: 130 })
    .png()
    .toBuffer();
}

async function buildSummonCard(element, variant, art) {
  const blank = path.join(ASSETS, "units-blank-bronze.webp");
  const stats = variant === "few" ? element.few : element.pack;
  const overlays = [
    { input: art, left: ART_LEFT, top: 162 },
    {
      input: svgBuffer(
        titleText(element.name) +
          groundIcon() +
          statText(stats, variant) +
          (variant === "few" ? fewCostPanel() : packPanel()) +
          abilityPanel(element.school, variant)
      )
    }
  ];
  const destination = path.join(
    ASSETS,
    `units-conflux-bronze-${element.slug}_elementals-${variant}.webp`
  );

  await sharp(blank)
    .resize(CARD_WIDTH, CARD_HEIGHT, { fit: "fill" })
    .composite(overlays)
    .webp({ quality: 94, effort: 6 })
    .toFile(destination);
  return destination;
}

async function buildNeutralCard(element, art) {
  const template = path.join(ASSETS, NEUTRAL_TEMPLATES[element.neutralTier]);
  const titlePatch = await cleanTitlePatch(element.neutralTier);
  const destination = path.join(
    ASSETS,
    `units-neutral-${element.neutralTier}-${element.slug}_elementals.webp`
  );

  await sharp(template)
    .resize(CARD_WIDTH, CARD_HEIGHT, { fit: "fill" })
    .composite([
      { input: titlePatch, left: 49, top: 40 },
      { input: art, left: ART_LEFT, top: 164 },
      {
        input: svgBuffer(
          titleText(element.name) +
            groundIcon() +
            statText(element.neutral, "neutral") +
            neutralCost(element.neutralCost) +
            abilityPanel(element.school, "neutral")
        )
      }
    ])
    .webp({ quality: 94, effort: 6 })
    .toFile(destination);
  return destination;
}

await mkdir(ASSETS, { recursive: true });

const outputs = [];
for (const elemental of ELEMENTALS) {
  const sharedArtPath = await ensureSharedArt(elemental);
  const sharedArt = await sharp(sharedArtPath).png().toBuffer();
  outputs.push(await buildSummonCard(elemental, "few", sharedArt));
  outputs.push(await buildSummonCard(elemental, "pack", sharedArt));
  outputs.push(await buildNeutralCard(elemental, sharedArt));
}

const previewWidth = 372;
const previewHeight = 519;
const previewGap = 12;
const previewCards = await Promise.all(
  outputs.map((output) =>
    sharp(output).resize(previewWidth, previewHeight, { fit: "fill" }).png().toBuffer()
  )
);
await mkdir(path.join(ROOT, "out"), { recursive: true });
await sharp({
  create: {
    width: previewWidth * 3 + previewGap * 2,
    height: previewHeight * 4 + previewGap * 3,
    channels: 4,
    background: "#16100c"
  }
})
  .composite(
    previewCards.map((input, index) => ({
      input,
      left: (index % 3) * (previewWidth + previewGap),
      top: Math.floor(index / 3) * (previewHeight + previewGap)
    }))
  )
  .png()
  .toFile(path.join(ROOT, "out", "elemental-cards-contact-sheet.png"));

for (const output of outputs) {
  console.log(path.relative(ROOT, output));
}

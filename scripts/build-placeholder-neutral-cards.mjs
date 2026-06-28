#!/usr/bin/env node

/**
 * Rebuild the 21 single-sided Neutral guard cards whose wiki images are blank.
 *
 * The creature illustration is cropped from that unit's official Few/Pack card,
 * so Few, Pack, and Neutral retain one visual identity. The Neutral face uses an
 * official Neutral card of the matching tier as its frame and the glyphs from
 * the wiki legend for every symbolic rules reference.
 *
 * Sources:
 *   https://en.homm3bg.wiki/towns/neutral/
 *   https://en.homm3bg.wiki/legend/
 */

import { readFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = path.join(ROOT, "public", "assets");
const GLYPHS = path.join(ROOT, "scripts", "card-glyphs");
const OUT = path.join(ROOT, "out");

// WebP encode settings. quality 80 / effort 6 keeps the legend glyphs and the
// rules text crisp while landing each card well under 130 KB — roughly half the
// size of a quality-94 encode (see scripts/build-missing-spell-cards.mjs for the
// same trade-off on the spell faces).
const WEBP = { quality: 80, effort: 6 };

const CARD_WIDTH = 743;
const CARD_HEIGHT = 1040;
const ART_WIDTH = 540;
const ART_HEIGHT = 594;
const ART_LEFT = 169;
const ART_TOP = 164;

const NEUTRAL_TEMPLATES = {
  bronze: "units-neutral-bronze-centaurs.webp",
  silver: "units-neutral-silver-zealots.webp",
  golden: "units-neutral-golden-nagas.webp",
  azure: "units-neutral-azure-hydras.webp"
};

const SOURCE_CROPS = {
  cove: { left: 168, top: 150, width: 528, height: 608 },
  conflux: { left: 162, top: 150, width: 532, height: 610 },
  stronghold: { left: 148, top: 152, width: 500, height: 586 }
};

const g = (name) => ({ glyph: name });

const CARDS = [
  {
    slug: "oceanids", name: "Oceanids", family: "cove", tier: "bronze",
    source: "units-cove-bronze-oceanids-few.webp", stats: [2, 0, 3, 6], cost: 3,
    fontSize: 23,
    lines: [[g("unit_passive"), " Ignore all effects and ", g("damage"), " from ", g("spell"), "."]]
  },
  {
    slug: "seamen", name: "Seamen", family: "cove", tier: "bronze",
    source: "units-cove-bronze-seamen-few.webp", stats: [2, 1, 3, 5], cost: 5,
    lines: []
  },
  {
    slug: "sea_dogs", name: "Sea Dogs", family: "cove", tier: "bronze",
    source: "units-cove-bronze-sea_dogs-few.webp", stats: [2, 0, 4, 6], cost: 7,
    fontSize: 23,
    lines: [[g("unit_passive"), " Ignore the combat penalty against"], ["adjacent units."]]
  },
  {
    slug: "ayssids", name: "Ayssids", family: "cove", tier: "silver",
    source: "units-cove-silver-ayssids-pack.webp", stats: [3, 1, 5, 9], cost: 9,
    fontSize: 18,
    lines: [
      [g("unit_attack"), " If the target is reduced to 0 ", g("health_points"), ", after"],
      ["resolving the ", g("unit_retaliation"), " (if applicable), the Ayssids"],
      ["can attack another adjacent unit."]
    ]
  },
  {
    slug: "sorceresses", name: "Sorceresses", family: "cove", tier: "silver",
    source: "units-cove-silver-sorceresses-pack.webp", stats: [3, 1, 5, 6], cost: 13,
    fontSize: 20,
    lines: [
      [g("unit_attack"), " After the attack, place a \"-1\" Weakness"],
      ["token on the target for 2 Combat rounds."]
    ]
  },
  {
    slug: "nix", name: "Nix", family: "cove", tier: "golden",
    source: "units-cove-golden-nix-few.webp", stats: [5, 1, 7, 6], cost: 20,
    fontSize: 22,
    lines: [[g("unit_passive"), " This unit cannot take more than 5 ", g("damage")], ["from a single attack."]]
  },
  {
    slug: "haspids", name: "Haspids", family: "cove", tier: "golden",
    source: "units-cove-golden-haspids-pack.webp", stats: [5, 2, 6, 9], cost: 25,
    fontSize: 18,
    lines: [
      [g("unit_attack"), " Place 1 faction cube on the target. At the"],
      ["beginning of its every activation, remove it to"],
      ["inflict 1 ", g("damage"), "."]
    ]
  },
  {
    slug: "goblins", name: "Goblins", family: "stronghold", tier: "bronze",
    source: "units-stronghold-bronze-goblins-few.webp", stats: [1, 0, 4, 6], cost: 4,
    lines: []
  },
  {
    slug: "wolf_raiders", name: "Wolf Raiders", family: "stronghold", tier: "bronze",
    source: "units-stronghold-bronze-wolf_raiders-pack.webp", stats: [2, 0, 3, 7], cost: 6,
    fontSize: 20,
    lines: [
      [g("unit_attack"), " Attack this target again. The second attack"],
      ["happens after the target retaliates (if possible)."]
    ]
  },
  {
    slug: "orcs", name: "Orcs", family: "stronghold", tier: "bronze",
    source: "units-stronghold-bronze-orcs-few.webp", stats: [2, 1, 4, 4], cost: 7,
    lines: []
  },
  {
    slug: "ogres", name: "Ogres", family: "stronghold", tier: "silver",
    source: "units-stronghold-silver-ogres-pack.webp", stats: [3, 2, 4, 4], cost: 10,
    fontSize: 18,
    lines: [
      [g("unit_other"), " Place a +2 ", g("attack"), " token on a chosen friendly"],
      [g("unit_ground"), " or ", g("unit_flying"), " unit for 2 Combat rounds."]
    ]
  },
  {
    slug: "thunderbirds", name: "Thunderbirds", family: "stronghold", tier: "silver",
    source: "units-stronghold-silver-thunderbirds-pack.webp", stats: [3, 0, 6, 9], cost: 13,
    fontSize: 17,
    lines: [
      [g("unit_passive"), " Right after this unit's attack and before any"],
      ["Retaliation, roll 1 Attack die, on a \"0\" or \"+1\","],
      ["deal 1 ", g("damage"), " to the target."]
    ]
  },
  {
    slug: "cyclopes", name: "Cyclopes", family: "stronghold", tier: "golden",
    source: "units-stronghold-golden-cyclopes-pack.webp", stats: [5, 1, 6, 8], cost: 19,
    fontSize: 21,
    lines: [[g("unit_other"), " This unit can destroy a Wall, the Gate,"], ["or the Arrow Tower."]]
  },
  {
    slug: "behemoths", name: "Behemoths", family: "stronghold", tier: "golden",
    source: "units-stronghold-golden-behemoths-pack.webp", stats: [5, 1, 8, 9], cost: 26,
    fontSize: 18,
    lines: [
      [g("unit_attack"), " Decrease the target's ", g("defense"), " by 2 (to a minimum"],
      ["of 0). After the attack, place 1 Corrosion token"],
      ["on the target."]
    ]
  },
  {
    slug: "sprites", name: "Sprites", family: "conflux", tier: "bronze",
    source: "units-conflux-bronze-sprites-pack.webp", stats: [2, 0, 2, 7], cost: 2,
    fontSize: 23,
    lines: [[g("unit_attack"), " Ignore the Retaliation Attack."]]
  },
  {
    slug: "ice_elementals", name: "Ice Elementals", family: "conflux", tier: "bronze",
    source: "units-conflux-bronze-ice_elementals-pack.webp", stats: [2, 1, 3, 5], cost: 7,
    fontSize: 19,
    lines: [[g("unit_passive"), " Immune to Magic Arrow and Water Magic spells."], ["This unit deals elemental damage."]]
  },
  {
    slug: "storm_elementals", name: "Storm Elementals", family: "conflux", tier: "bronze",
    source: "units-conflux-bronze-storm_elementals-pack.webp", stats: [2, 0, 3, 7], cost: 5,
    fontSize: 19,
    lines: [[g("unit_passive"), " Immune to Magic Arrow and Air Magic spells."], ["This unit deals elemental damage."]]
  },
  {
    slug: "energy_elementals", name: "Energy Elementals", family: "conflux", tier: "silver",
    source: "units-conflux-silver-energy_elementals-pack.webp", stats: [3, 1, 4, 5], cost: 11,
    fontSize: 19,
    lines: [[g("unit_passive"), " Immune to Magic Arrow and Fire Magic spells."], ["This unit deals elemental damage."]]
  },
  {
    slug: "magma_elementals", name: "Magma Elementals", family: "conflux", tier: "silver",
    source: "units-conflux-silver-magma_elementals-few.webp", stats: [3, 2, 4, 4], cost: 14,
    fontSize: 19,
    lines: [[g("unit_passive"), " Immune to Magic Arrow and Earth Magic spells."], ["This unit deals elemental damage."]]
  },
  {
    slug: "magic_elementals", name: "Magic Elementals", family: "conflux", tier: "golden",
    source: "units-conflux-golden-magic_elementals-few.webp", stats: [3, 1, 7, 7], cost: 19,
    fontSize: 21,
    lines: [[g("unit_passive"), " Immune to Magic Arrow."], ["This unit deals elemental damage."]]
  },
  {
    slug: "phoenixes", name: "Phoenixes", family: "conflux", tier: "azure",
    source: "units-conflux-golden-phoenixes-few.webp", stats: [6, 2, 7, 12], cost: 32,
    fontSize: 17,
    lines: [
      [g("unit_passive"), " Once per Combat, when this unit's ", g("health_points")],
      ["drops to 0, set it to 1 instead."],
      [g("unit_passive"), " Immune to Fire Magic ", g("spell"), "."]
    ]
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

function titleText(name) {
  const size = name.length > 16 ? 38 : name.length > 12 ? 41 : 46;
  return `<text x="385" y="109" text-anchor="middle" dominant-baseline="middle"
    font-family="Georgia, 'Times New Roman', serif" font-size="${size}" font-weight="700"
    fill="#f6e7a6" stroke="#170f09" stroke-width="3" paint-order="stroke">${escapeXml(name)}</text>`;
}

function statText(stats) {
  const ys = [286, 441, 596, 750];
  const patchBoxes = [[249, 72], [404, 76], [558, 80], [712, 94]];
  const patches = patchBoxes.map(([top, height]) =>
    `<rect x="86" y="${top}" width="66" height="${height}" rx="5" fill="#372317" fill-opacity="0.99"/>`
  ).join("");
  const labels = stats.map((value, index) => {
    const size = String(value).length > 1 ? 29 : 34;
    return `<text x="119" y="${ys[index]}" text-anchor="middle" dominant-baseline="middle"
      font-family="Georgia, 'Times New Roman', serif" font-size="${size}" font-weight="700"
      fill="#fff4c8" stroke="#140c07" stroke-width="3" paint-order="stroke">${value}</text>`;
  }).join("");
  return patches + labels;
}

function neutralCost(cost) {
  return `<rect x="474" y="766" width="158" height="50" rx="4" fill="#50472d" fill-opacity="0.99"/>
    <text x="563" y="793" text-anchor="middle" dominant-baseline="middle"
      font-family="Georgia, 'Times New Roman', serif" font-size="33" font-weight="700"
      fill="#fff2c4" stroke="#160e08" stroke-width="3" paint-order="stroke">${cost}</text>`;
}

async function glyphDataUri(name) {
  const source = await readFile(path.join(GLYPHS, `${name}.svg`), "utf8");
  const tinted = source.replaceAll("currentColor", "#f0d56b");
  return `data:image/svg+xml;base64,${Buffer.from(tinted).toString("base64")}`;
}

function textWidth(text, fontSize) {
  return text.length * fontSize * 0.51;
}

async function abilityPanel(card) {
  const top = 830;
  const height = 142;
  const fontSize = card.fontSize ?? 21;
  const lineHeight = fontSize + 9;
  const firstY = 838 + (height - card.lines.length * lineHeight) / 2 + fontSize * 0.72;
  let body = `<rect x="69" y="${top}" width="641" height="${height}" fill="#282019" fill-opacity="0.985" stroke="#8d683c" stroke-width="3"/>`;

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

async function cleanTitlePatch(tier) {
  return sharp(path.join(ASSETS, `units-blank-${tier}.webp`))
    .resize(CARD_WIDTH, CARD_HEIGHT, { fit: "fill" })
    .extract({ left: 49, top: 40, width: 675, height: 130 })
    .png()
    .toBuffer();
}

async function sharedArt(card) {
  const crop = SOURCE_CROPS[card.family];
  return sharp(path.join(ASSETS, card.source))
    .extract(crop)
    .resize(ART_WIDTH, ART_HEIGHT, { fit: "fill" })
    .png()
    .toBuffer();
}

async function buildCard(card) {
  const titlePatch = await cleanTitlePatch(card.tier);
  const art = await sharedArt(card);
  const overlay = svgBuffer(
    titleText(card.name) +
    statText(card.stats) +
    neutralCost(card.cost) +
    await abilityPanel(card)
  );
  const destination = path.join(ASSETS, `units-neutral-${card.tier}-${card.slug}.webp`);

  await sharp(path.join(ASSETS, NEUTRAL_TEMPLATES[card.tier]))
    .resize(CARD_WIDTH, CARD_HEIGHT, { fit: "fill" })
    .composite([
      { input: titlePatch, left: 49, top: 40 },
      { input: art, left: ART_LEFT, top: ART_TOP },
      { input: overlay }
    ])
    .webp(WEBP)
    .toFile(destination);
  return destination;
}

await mkdir(ASSETS, { recursive: true });
await mkdir(OUT, { recursive: true });

const outputs = [];
for (const card of CARDS) outputs.push(await buildCard(card));

const previewWidth = 248;
const previewHeight = 347;
const previewGap = 10;
const previewColumns = 7;
const previewRows = Math.ceil(outputs.length / previewColumns);
const previews = await Promise.all(outputs.map((output) =>
  sharp(output).resize(previewWidth, previewHeight, { fit: "fill" }).png().toBuffer()
));
await sharp({
  create: {
    width: previewColumns * previewWidth + (previewColumns - 1) * previewGap,
    height: previewRows * previewHeight + (previewRows - 1) * previewGap,
    channels: 4,
    background: "#15100c"
  }
})
  .composite(previews.map((input, index) => ({
    input,
    left: (index % previewColumns) * (previewWidth + previewGap),
    top: Math.floor(index / previewColumns) * (previewHeight + previewGap)
  })))
  .png()
  .toFile(path.join(OUT, "placeholder-neutral-cards-contact-sheet.png"));

for (const output of outputs) console.log(path.relative(ROOT, output));

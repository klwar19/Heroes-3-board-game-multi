#!/usr/bin/env node

/**
 * Rebuild the 18 unique Creature Bank unit faces whose wiki images are blank.
 *
 * Each card starts from that creature's real Few/Neutral scan. The title,
 * frame, unit-type mark, and illustration are therefore the real matching
 * design. Only the four printed values, the cost strip, and the rules panel
 * are replaced. The output is lossy WebP at quality 94 (the same setting every
 * other card-face build script in this repo uses), keeping the file size in
 * line with the rest of /public/assets while leaving the untouched
 * illustration visually identical to the source scan.
 *
 * Sources:
 *   https://en.homm3bg.wiki/units/
 *   https://en.homm3bg.wiki/legend/
 *
 * !! STALE AS OF 2026-08-04 — DO NOT RE-RUN BLINDLY !!
 * The premise above ("the 18 unique Creature Bank unit faces whose wiki images
 * are blank") is NO LONGER TRUE. en.homm3bg.wiki now publishes the GENUINE
 * printed NAVAL BATTLES scans for all 18 — not under a units-* name (which is
 * why the old mirror-name probe 404'd) but bank-scoped, linked from each
 * creature's own /units/<unit>/ page:
 *   https://en.homm3bg.wiki/assets/creature_banks-<bank_slug>-<unit_slug>.webp
 * Those real scans are what is committed in public/assets today. Re-running
 * this script would OVERWRITE the printed cards with the crop-and-overlay
 * composites. If you ever do, restore them with:
 *   py scripts/fetch-wiki-art-round3.py
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

const VIEW_WIDTH = 743;
const VIEW_HEIGHT = 1040;
const g = (name) => ({ glyph: name });

const CARDS = [
  {
    slug: "familiars", source: "units-inferno-bronze-familiars-few.webp", stats: [1, 0, 2, 5], fontSize: 17,
    lines: [
      [g("unit_passive"), " As long as this unit is Stacked, whenever the"],
      ["enemy casts a ", g("spell"), ", reduce their ", g("power"), " by 1"],
      ["(to a minimum of 0)."]
    ]
  },
  {
    slug: "skeletons", source: "units-necropolis-bronze-skeletons-few.webp", stats: [1, 0, 2, 4], fontSize: 20,
    lines: [
      [g("unit_passive"), " Once per Combat. When this unit's ", g("health_points")],
      ["drops to 0, set it to 1 instead."]
    ]
  },
  {
    slug: "zombies", source: "units-necropolis-bronze-zombies-few.webp", stats: [1, 0, 2, 3], fontSize: 18,
    lines: [
      [g("unit_passive"), " If the attacker resolves a \"+1\" on the Attack die"],
      ["against this unit, gain +1 ", g("defense"), "."]
    ]
  },
  {
    slug: "wraiths", source: "units-necropolis-bronze-wraiths-few.webp", stats: [2, 0, 3, 5], fontSize: 18,
    lines: [
      [g("unit_passive"), " Whenever this unit attacks, the enemy must"],
      ["discard 1 card from hand (if possible)."]
    ]
  },
  {
    slug: "vampires", source: "units-necropolis-silver-vampires-few.webp", stats: [2, 0, 3, 6], fontSize: 20,
    lines: [
      [g("unit_attack"), " After the attack, remove all ", g("damage"), " from"],
      ["this unit."]
    ]
  },
  {
    slug: "dwarves", source: "units-rampart-bronze-dwarves-few.webp", stats: [2, 1, 3, 3], fontSize: 18,
    lines: [
      [g("unit_passive"), " As long as this unit is Stacked, it is treated"],
      ["as if it had a ", g("defense"), " token on it."]
    ]
  },
  {
    slug: "medusas", source: "units-dungeon-silver-medusas-few.webp", stats: [3, 0, 3, 6], fontSize: 18,
    lines: [
      [g("unit_attack"), " Ignore the Retaliation Attack. If this unit"],
      ["is Stacked, the target gains ", g("paralysis"), "."]
    ]
  },
  {
    slug: "dragon_flies", source: "units-fortress-bronze-dragon_flies-few.webp", stats: [3, 0, 2, 8], fontSize: 18,
    lines: [
      [g("unit_attack"), " Retaliation Attacks against this unit"],
      ["suffer -2 ", g("attack"), "."]
    ]
  },
  {
    slug: "water_elementals", source: "units-conflux-bronze-water_elementals-few.webp", stats: [3, 0, 5, 6], fontSize: 21,
    lines: [[g("unit_passive"), " Immune to Magic Arrow."]]
  },
  {
    slug: "gold_golems", source: "units-neutral-golden-gold_golems.webp", stats: [3, 1, 4, 4], fontSize: 18,
    lines: [
      [g("unit_passive"), " This unit reduces any ", g("damage"), " it takes from ", g("spell")],
      ["by 2 (to a minimum of 0)."]
    ]
  },
  {
    slug: "diamond_golems", source: "units-neutral-golden-diamond_golems.webp", stats: [3, 1, 5, 5], fontSize: 18,
    lines: [
      [g("unit_passive"), " This unit reduces any ", g("damage"), " it takes from ", g("spell")],
      ["by 3 (to a minimum of 0)."]
    ]
  },
  {
    slug: "griffins", source: "units-castle-bronze-griffins-few.webp", stats: [3, 0, 4, 8], fontSize: 19,
    lines: [
      [g("unit_passive"), " This unit can perform an unlimited number"],
      ["of Retaliation Attacks."]
    ]
  },
  {
    slug: "nagas", source: "units-tower-golden-nagas-few.webp", stats: [4, 1, 5, 6], fontSize: 21,
    lines: [[g("unit_attack"), " Ignore Retaliation Attacks."]]
  },
  {
    slug: "cyclopes", source: "units-stronghold-golden-cyclopes-few.webp", stats: [5, 1, 5, 8], lines: []
  },
  {
    slug: "black_dragons", source: "units-dungeon-golden-black_dragons-few.webp", stats: [5, 2, 5, 9], fontSize: 19,
    lines: [
      [g("unit_passive"), " As long as this unit is Stacked, it gains"],
      ["+3 ", g("attack"), "."]
    ]
  },
  {
    slug: "gold_dragons", source: "units-rampart-golden-gold_dragons-few.webp", stats: [5, 2, 6, 10], fontSize: 18,
    lines: [
      [g("unit_attack"), " Attack 2 spaces in a line. The first attack"],
      ["resolves normally; the second has 3 ", g("attack"), "."]
    ]
  },
  {
    slug: "faerie_dragons", source: "units-neutral-azure-faerie_dragons.webp", stats: [4, 2, 6, 15], fontSize: 19,
    lines: [
      [g("unit_passive"), " As long as this unit is Stacked, the enemy"],
      ["cannot cast ", g("spell"), "."]
    ]
  },
  {
    slug: "crystal_dragons", source: "units-neutral-azure-crystal_dragons.webp", stats: [6, 2, 6, 16], fontSize: 18,
    lines: [
      [g("unit_passive"), " As long as this unit is Stacked, it is treated"],
      ["as if it had a ", g("defense"), " token on it."]
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

async function glyphDataUri(name) {
  const source = await readFile(path.join(GLYPHS, `${name}.svg`), "utf8");
  const tinted = source.replaceAll("currentColor", "#f0d56b");
  return `data:image/svg+xml;base64,${Buffer.from(tinted).toString("base64")}`;
}

function textWidth(text, fontSize) {
  return text.length * fontSize * 0.51;
}

// Stat-number centres, measured off the real scans. There are TWO frame
// layouts: the faction "few" cards share one (template A), while the four
// neutral-golden / neutral-azure scans (gold/diamond Golems, faerie/crystal
// Dragons) space their lower cells further down (template B). Using one set for
// both left the neutral cards' printed numbers peeking out below the plaque.
const STAT_CENTERS = {
  few: [258, 415, 578, 748],
  neutral: [270, 452, 632, 800]
};

function statPanel(stats, centers) {
  // The old build placed the values ~20px too low, so they drifted toward each
  // cell's divider and read as loose stickers; these sit them back in the icon's
  // number slot and give each a carved plaque matching the CREATURE BANK strip +
  // rules panel, so the whole overlay reads as one deliberate restat rather than
  // four mismatched dark boxes.
  const x = 86;
  const w = 66;
  const h = 54;
  const defs = `<defs>
    <linearGradient id="statPlaque" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3c2b1c"/>
      <stop offset="0.5" stop-color="#2a1d13"/>
      <stop offset="1" stop-color="#1c120c"/>
    </linearGradient>
  </defs>`;
  const plaques = centers
    .map((cy) => {
      const top = cy - h / 2;
      return `<rect x="${x}" y="${top}" width="${w}" height="${h}" rx="8"
        fill="url(#statPlaque)" stroke="#8d683c" stroke-width="2.5"/>
      <rect x="${x + 2.5}" y="${top + 2.5}" width="${w - 5}" height="${h - 5}" rx="6"
        fill="none" stroke="#d8ad63" stroke-width="0.9" stroke-opacity="0.45"/>`;
    })
    .join("");
  const values = stats
    .map((value, index) => {
      const size = String(value).length > 1 ? 30 : 35;
      return `<text x="${x + w / 2}" y="${centers[index]}" text-anchor="middle" dominant-baseline="middle"
      font-family="Georgia, 'Times New Roman', serif" font-size="${size}" font-weight="700"
      fill="#fff4c8" stroke="#140c07" stroke-width="3" paint-order="stroke">${value}</text>`;
    })
    .join("");
  return defs + plaques + values;
}

function bankStrip() {
  return `<rect x="69" y="770" width="99" height="59" fill="#282019" fill-opacity="0.995" stroke="#8d683c" stroke-width="3"/>
    <rect x="169" y="763" width="541" height="66" fill="#282019" fill-opacity="0.995" stroke="#8d683c" stroke-width="3"/>
    <text x="439" y="797" text-anchor="middle" dominant-baseline="middle"
      font-family="Georgia, 'Times New Roman', serif" font-size="26" font-weight="700" letter-spacing="3"
      fill="#f2d97a" stroke="#160e08" stroke-width="2" paint-order="stroke">CREATURE BANK</text>`;
}

async function abilityPanel(card) {
  const top = 830;
  const height = 142;
  const fontSize = card.fontSize ?? 21;
  const lineHeight = fontSize + 10;
  const firstY = top + (height - card.lines.length * lineHeight) / 2 + fontSize * 0.72;
  let body = `<rect x="69" y="${top}" width="641" height="${height}" fill="#282019" fill-opacity="0.995" stroke="#8d683c" stroke-width="3"/>`;

  for (let lineIndex = 0; lineIndex < card.lines.length; lineIndex += 1) {
    const line = card.lines[lineIndex];
    const glyphSize = fontSize + 4;
    const widths = line.map((token) => typeof token === "string" ? textWidth(token, fontSize) : glyphSize + 3);
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

async function buildCard(card) {
  const sourcePath = path.join(ASSETS, card.source);
  const metadata = await sharp(sourcePath).metadata();
  if (!metadata.width || !metadata.height) throw new Error(`Cannot read ${card.source}`);

  // The "few" faction scans and the neutral-golden/azure scans lay their stat
  // wells out differently — pick the matching number centres.
  const centers = card.source.includes("-few") ? STAT_CENTERS.few : STAT_CENTERS.neutral;
  // Draw the stat plaques LAST so the (low) neutral-template initiative plaque
  // sits on top of the CREATURE BANK strip's empty left box instead of being
  // hidden behind it. The plaques only occupy the stat column, so they never
  // overlap the "CREATURE BANK" banner text or the rules panel.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${metadata.width}" height="${metadata.height}" viewBox="0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}">
    ${bankStrip()}
    ${await abilityPanel(card)}
    ${statPanel(card.stats, centers)}
  </svg>`;
  const destination = path.join(ASSETS, `units-creature-bank-${card.slug}.webp`);

  await sharp(sourcePath)
    .composite([{ input: Buffer.from(svg) }])
    .webp({ quality: 94, effort: 6 })
    .toFile(destination);
  return destination;
}

await mkdir(OUT, { recursive: true });
// Optional slug filter: `node scripts/build-creature-bank-unit-cards.mjs cyclopes
// water_elementals` rebuilds only those faces. No args = every card (unchanged
// default). Used by the 2026-08 wiki card refresh, which replaced a handful of
// SOURCE scans (scripts/fetch-unit-art-refresh.py) and so had to re-derive just
// the bank faces cropped from them, without re-encoding the other sixteen.
const onlySlugs = new Set(process.argv.slice(2));
const selected = onlySlugs.size ? CARDS.filter((card) => onlySlugs.has(card.slug)) : CARDS;
if (onlySlugs.size && selected.length !== onlySlugs.size) {
  const known = new Set(CARDS.map((card) => card.slug));
  const unknown = [...onlySlugs].filter((slug) => !known.has(slug));
  throw new Error(`Unknown creature-bank slug(s): ${unknown.join(", ")}`);
}
const outputs = [];
for (const card of selected) outputs.push(await buildCard(card));

const previewWidth = 223;
const previewHeight = 312;
const previewGap = 10;
const previewColumns = 6;
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
  .toFile(path.join(OUT, "creature-bank-unit-cards-contact-sheet.png"));

for (const output of outputs) console.log(path.relative(ROOT, output));

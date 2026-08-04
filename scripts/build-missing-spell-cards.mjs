#!/usr/bin/env node

/**
 * Build original replacements for the spell faces that are deck-back
 * placeholders on en.homm3bg.wiki.
 *
 * Generated artwork is used only in the central illustration. The outer frame
 * comes from an existing spell of the same school, while all rules text and
 * legend glyphs are composed deterministically so the finished cards stay
 * readable and mechanically exact.
 *
 * !! STALE AS OF 2026-08-04 — DO NOT RE-RUN BLINDLY !!
 * en.homm3bg.wiki now publishes the GENUINE printed scans for every spell this
 * script builds (Quicksand, Force Field, Sacrifice, Magic Mirror, Clone, Land
 * Mine, Protection from Air/Earth/Fire/Water, Air Shield, Water Walk...), and
 * those real scans are what is committed in public/assets today. Re-running
 * this script would OVERWRITE the printed cards with the generated originals.
 * If you ever do, restore them with:
 *   py scripts/fetch-spell-art-refresh.py
 */

import { mkdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = path.join(ROOT, "public", "assets");
// Build inputs (source art + legend glyphs) live under scripts/ so the heavy
// raw art is never shipped in public/ — only the finished, compressed card
// faces land in public/assets. Mirrors scripts/summon-art for the Summon cards.
const ART_SRC = path.join(ROOT, "scripts", "missing-spell-art");
const GLYPHS = path.join(ROOT, "scripts", "card-glyphs");
const OUT = path.join(ROOT, "out");

const CARD_WIDTH = 743;
const CARD_HEIGHT = 1040;
const GOLD = "#eadb8f";
const LIGHT = "#eee5c8";
const DARK = "#4a3424";

const SPELLS = [
  {
    slug: "magic_mirror",
    title: "Magic Mirror",
    school: "air",
    template: "spells-chain_lightning.webp",
    art: "spells-magic_mirror-art.webp",
    paper: [139, 101, 81],
    seed: 101,
    timing: "instant",
    lines: [
      "When your unit is about to be targeted or damaged",
      "by a Spell, choose a new target for that Spell.",
    ],
    ruleGlyphs: [{ name: "spell", left: 626, top: 531, width: 31, height: 31 }],
    rows: [
      { power: 0, kind: "grades", grades: ["bronze"] },
      { power: 1, kind: "grades", grades: ["bronze", "silver"] },
      { power: 2, kind: "grades", grades: ["bronze", "silver", "golden"] },
    ],
  },
  {
    slug: "quicksand",
    title: "Quicksand",
    school: "earth",
    template: "spells-anti_magic.webp",
    art: "spells-quicksand-art.webp",
    paper: [137, 100, 81],
    seed: 113,
    timing: "ongoing",
    fontSize: 21,
    lines: [
      "Shuffle up to X Quicksand tokens and place them",
      "face down on chosen empty spaces. Once placed,",
      "you can look at your tokens.",
    ],
    rows: [
      { power: 0, kind: "text", text: "2 tokens" },
      { power: 1, kind: "text", text: "4 tokens" },
      { power: 2, kind: "text", text: "6 tokens" },
    ],
  },
  {
    slug: "land_mine",
    title: "Land Mine",
    school: "fire",
    template: "spells-fire_shield.webp",
    art: "spells-land_mine-art.webp",
    paper: [139, 100, 80],
    seed: 127,
    timing: "ongoing",
    fontSize: 20,
    lines: [
      "Shuffle and randomly place up to X Land Mine tokens",
      "on chosen empty spaces. Afterward, you can look at",
      "the reverse sides of your tokens.",
    ],
    rows: [
      { power: 0, kind: "text", text: "2 tokens" },
      { power: 1, kind: "text", text: "4 tokens" },
      { power: 2, kind: "text", text: "6 tokens" },
    ],
  },
  {
    slug: "force_field",
    title: "Force Field",
    school: "earth",
    template: "spells-anti_magic.webp",
    art: "spells-force_field-art.webp",
    paper: [137, 100, 81],
    seed: 139,
    timing: "ongoing",
    fontSize: 21,
    lines: [
      "Place this card or a Force Field token on an empty",
      "space. It counts as an Obstacle until the end of:",
    ],
    rows: [
      { power: 0, kind: "text", text: "this Combat round" },
      { power: 1, kind: "text", text: "the next Combat round" },
      { power: 2, kind: "text", text: "this Combat" },
    ],
  },
  {
    slug: "air_shield",
    title: "Air Shield",
    school: "air",
    template: "spells-haste.webp",
    art: "spells-air_shield-art.webp",
    paper: [139, 101, 81],
    seed: 151,
    timing: "ongoing",
    fontSize: 21,
    lines: [
      "Until the end of the Combat, the selected unit gains",
      "Defense when it is attacked by a Ranged unit.",
    ],
    ruleGlyphs: [
      { name: "unit_ranged", left: 617, top: 530, width: 34, height: 34 },
    ],
    rows: [
      { power: 0, kind: "stat", text: "+1", glyph: "defense" },
      { power: 1, kind: "stat", text: "+2", glyph: "defense" },
      { power: 2, kind: "stat", text: "+3", glyph: "defense" },
    ],
  },
  {
    slug: "clone",
    title: "Clone",
    school: "water",
    template: "spells-prayer.webp",
    art: "spells-clone-art.webp",
    paper: [137, 101, 83],
    seed: 163,
    timing: "ongoing",
    fontSize: 20,
    lines: [
      "Place a Clone token on an allied unit and one on an",
      "empty space adjacent to that unit. The Cloned unit",
      "acts like the original one, but has only 1 Health.",
    ],
    ruleGlyphs: [
      { name: "health_points", left: 621, top: 548, width: 31, height: 31 },
    ],
    rows: [
      { power: 1, kind: "grades", grades: ["bronze"] },
      { power: 3, kind: "grades", grades: ["bronze", "silver"] },
      { power: 5, kind: "grades", grades: ["bronze", "silver", "golden"] },
    ],
  },
  ...[
    ["air", "spells-haste.webp", [139, 101, 81], 173],
    ["earth", "spells-anti_magic.webp", [137, 100, 81], 181],
    ["fire", "spells-bloodlust.webp", [139, 100, 80], 191],
    ["water", "spells-bless.webp", [137, 101, 83], 199],
  ].map(([school, template, paper, seed]) => ({
    slug: `protection_from_${school}`,
    title: `Protection from ${school[0].toUpperCase()}${school.slice(1)}`,
    school,
    template,
    art: `spells-protection_from_${school}-art.webp`,
    paper,
    seed,
    timing: "instant",
    fontSize: 20,
    titleSize: 34,
    lines: [
      `Play this card after a Spell from the School of ${school[0].toUpperCase()}${school.slice(1)}`,
      "Magic is cast to ignore that Spell's effect.",
    ],
    ruleGlyphs: [{ name: "spell", left: 619, top: 530, width: 31, height: 31 }],
    rows: [
      { power: 0, kind: "spellLevel", text: "a Basic Spell" },
      {
        power: 1,
        kind: "spellLevel",
        text: "a Basic or an Expert Spell",
        expert: true,
      },
    ],
  })),
  {
    slug: "water_walk",
    title: "Water Walk",
    school: "water",
    template: "spells-prayer.webp",
    art: "spells-water_walk-art.webp",
    paper: [137, 101, 83],
    seed: 211,
    timing: "map_effect",
    fontSize: 20,
    lines: [
      "Choose one of your Heroes. They gain Movement and can",
      "continue moving after entering a sea field from land.",
    ],
    rows: [
      { power: 0, kind: "stat", text: "+0", glyph: "movement" },
      { power: 1, kind: "stat", text: "+1", glyph: "movement" },
      { power: 2, kind: "stat", text: "+2", glyph: "movement" },
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

function paperPatch(width, height, rgb, seed, feather = 12) {
  const random = mulberry32(seed);
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const grain = Math.round((random() - 0.5) * 9);
      const mottling = Math.round(
        3 * Math.sin(x / 31 + seed) + 2 * Math.sin(y / 47 + seed / 3),
      );
      const shade = Math.round(
        ((x / width - 0.5) ** 2 + (y / height - 0.5) ** 2) * -7,
      );
      pixels[index] = Math.max(
        0,
        Math.min(255, rgb[0] + grain + mottling + shade),
      );
      pixels[index + 1] = Math.max(
        0,
        Math.min(255, rgb[1] + grain + mottling + shade),
      );
      pixels[index + 2] = Math.max(
        0,
        Math.min(255, rgb[2] + grain + mottling + shade),
      );
      const edge = Math.min(x, y, width - 1 - x, height - 1 - y);
      pixels[index + 3] =
        feather === 0 ? 255 : Math.round(255 * Math.min(1, edge / feather));
    }
  }
  return { input: pixels, raw: { width, height, channels: 4 } };
}

async function preparedArt(source) {
  const width = 466;
  const height = 340;
  const image = await sharp(source)
    .resize(width, height, { fit: "cover", position: "centre" })
    .ensureAlpha()
    .png()
    .toBuffer();
  const mask =
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><radialGradient id="fade" cx="50%" cy="48%" r="65%">
      <stop offset="0%" stop-color="white" stop-opacity="1"/>
      <stop offset="67%" stop-color="white" stop-opacity="1"/>
      <stop offset="100%" stop-color="white" stop-opacity="0"/>
    </radialGradient></defs>
    <rect width="100%" height="100%" fill="url(#fade)"/>
  </svg>`);
  return sharp(image)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

function airOrnaments() {
  return `<g fill="#ece7dc" stroke="#c8c1b4" stroke-width="2" opacity=".76">
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
  return `<g stroke="#355022" stroke-width="4" stroke-linecap="round" opacity=".78">
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
  return `<g stroke="#8d3421" stroke-width="3" opacity=".82">
    <defs><g id="fireMark"><path d="M0 52c-8-34 15-40 9-72 20 13 20 32 18 43 9-10 16-24 10-40 27 22 32 50 10 72-18 18-39 11-47-3z" fill="#ef6a31"/>
      <path d="M14 46c-3-19 9-25 13-38 12 12 16 28 6 43-8 11-16 6-19-5z" fill="#f5b03a" stroke="none"/></g></defs>
    <use href="#fireMark" transform="translate(106 154) scale(1.15)"/>
    <use href="#fireMark" transform="translate(637 154) scale(-1.15 1.15)"/>
    <use href="#fireMark" transform="translate(106 424) scale(1.15 -1.15)"/>
    <use href="#fireMark" transform="translate(637 424) scale(-1.15 -1.15)"/>
  </g>`;
}

function waterOrnaments() {
  return `<g opacity=".8">
    <defs><g id="waterMark"><path d="M-4 26c14-42 54-49 73-7-25-16-50-15-73 7z" fill="#d3b16f" stroke="#795c3e" stroke-width="3"/>
      <path d="M4 18L30-8M18 14L38-10M34 13L45-6M49 17L51 0" stroke="#836744" stroke-width="3"/>
      <path d="M-8 34c22 13 48 13 71-1 11-7 20-6 29 2-13 8-21 20-24 34" fill="none" stroke="#394e91" stroke-width="7" stroke-linecap="round"/></g></defs>
    <use href="#waterMark" transform="translate(105 157) scale(.95)"/>
    <use href="#waterMark" transform="translate(638 157) scale(-.95 .95)"/>
    <use href="#waterMark" transform="translate(105 423) scale(.95 -.95)"/>
    <use href="#waterMark" transform="translate(638 423) scale(-.95 -.95)"/>
  </g>`;
}

function ornaments(school) {
  if (school === "air") return airOrnaments();
  if (school === "earth") return earthOrnaments();
  if (school === "fire") return fireOrnaments();
  return waterOrnaments();
}

function rowYs(count) {
  return count === 2 ? [692, 776] : [662, 725, 788];
}

function rowText(row, y) {
  if (row.kind === "text") {
    return `<text x="390" y="${y}" font-size="23">${escapeXml(row.text)}</text>`;
  }
  if (row.kind === "stat") {
    return `<text x="395" y="${y}" font-size="25" font-weight="700">${escapeXml(row.text)}</text>`;
  }
  if (row.kind === "spellLevel") {
    return `<text x="429" y="${y}" font-size="21">${escapeXml(row.text)}</text>`;
  }
  if (row.kind === "grades") {
    const words = [];
    if (row.grades.length >= 2)
      words.push(`<text x="436" y="${y}" font-size="18">or</text>`);
    if (row.grades.length >= 3)
      words.push(`<text x="505" y="${y}" font-size="18">or</text>`);
    return words.join("");
  }
  return "";
}

function textOverlay(spell) {
  const ys = rowYs(spell.rows.length);
  const lineGap = 31;
  const linesHeight = (spell.lines.length - 1) * lineGap;
  const lineStart = 544 - linesHeight / 2;
  const titleSize = spell.titleSize ?? (spell.title.length > 17 ? 37 : 44);

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
    <g fill="none" stroke="#614737" stroke-width="2" opacity=".18">
      <path d="M82 132c84-42 118-11 98 38-18 43-3 70 42 78M661 132c-84-42-118-11-98 38 18 43 3 70-42 78"/>
      <path d="M85 455c77 24 107 7 92-39M658 455c-77 24-107 7-92-39"/>
      <path d="M76 583c96-44 164-42 231 5M667 583c-96-44-164-42-231 5"/>
    </g>
    ${ornaments(spell.school)}
    <g font-family="Georgia, 'Times New Roman', serif" paint-order="stroke" stroke="${DARK}" stroke-width="3" fill="${LIGHT}" text-anchor="middle" dominant-baseline="middle">
      <text x="371.5" y="78" font-size="${titleSize}" font-weight="700" fill="${GOLD}">${escapeXml(spell.title)}</text>
      ${spell.lines
        .map(
          (line, index) =>
            `<text x="386" y="${lineStart + index * lineGap}" font-size="${spell.fontSize ?? 22}" font-weight="700">${escapeXml(line)}</text>`,
        )
        .join("\n")}
    </g>
    <g fill="none" stroke="#c8aa65" stroke-width="2" opacity=".9">
      <circle cx="211" cy="725" r="59"/>
      ${ys.map((y) => `<path d="M269 ${y}h34M353 ${y}h26"/><circle cx="328" cy="${y}" r="24"/>`).join("\n")}
    </g>
    <g font-family="Georgia, 'Times New Roman', serif" paint-order="stroke" stroke="${DARK}" stroke-width="3" fill="${LIGHT}" dominant-baseline="middle">
      ${spell.rows.map((row, index) => `<text x="328" y="${ys[index]}" text-anchor="middle" font-size="22">${row.power}:</text>${rowText(row, ys[index])}`).join("\n")}
    </g>
  </svg>`);
}

async function glyphBuffer(name, width, height, tint = GOLD) {
  const source = (
    await readFile(path.join(GLYPHS, `${name}.svg`), "utf8")
  ).replaceAll("currentColor", tint);
  return sharp(Buffer.from(source))
    .resize(width, height, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .png()
    .toBuffer();
}

async function glyphLayers(spell) {
  const ys = rowYs(spell.rows.length);
  const specs = [
    { name: spell.timing, left: 70, top: 517, width: 42, height: 42 },
    { name: "power", left: 163, top: 677, width: 96, height: 96 },
    ...(spell.ruleGlyphs ?? []),
  ];

  spell.rows.forEach((row, index) => {
    const y = ys[index];
    if (row.kind === "grades") {
      const positions = [382, 452, 522];
      row.grades.forEach((name, gradeIndex) => {
        specs.push({
          name,
          left: positions[gradeIndex],
          top: y - 19,
          width: 38,
          height: 38,
          tint: null,
        });
      });
    } else if (row.kind === "stat") {
      specs.push({
        name: row.glyph,
        left: 445,
        top: y - 19,
        width: 38,
        height: 38,
      });
    } else if (row.kind === "spellLevel") {
      specs.push({
        name: "spell",
        left: 382,
        top: y - 18,
        width: 36,
        height: 36,
      });
      if (row.expert)
        specs.push({
          name: "expert",
          left: 626,
          top: y - 16,
          width: 32,
          height: 32,
        });
    }
  });

  return Promise.all(
    specs.map(async ({ name, left, top, width, height, tint }) => ({
      input: await glyphBuffer(
        name,
        width,
        height,
        tint === null ? undefined : tint,
      ),
      left,
      top,
    })),
  );
}

async function buildCard(spell) {
  const art = await preparedArt(path.join(ART_SRC, spell.art));
  const destination = path.join(ASSETS, `spells-${spell.slug}.webp`);
  const temporary = `${destination}.tmp.webp`;
  const glyphs = await glyphLayers(spell);

  await sharp(path.join(ASSETS, spell.template))
    .resize(CARD_WIDTH, CARD_HEIGHT, { fit: "fill" })
    .composite([
      {
        ...paperPatch(543, 85, spell.paper, spell.seed, 10),
        left: 100,
        top: 33,
      },
      {
        ...paperPatch(666, 363, spell.paper, spell.seed + 1, 0),
        left: 39,
        top: 106,
      },
      {
        ...paperPatch(666, 179, spell.paper, spell.seed + 2, 0),
        left: 39,
        top: 466,
      },
      {
        ...paperPatch(666, 240, spell.paper, spell.seed + 3, 0),
        left: 39,
        top: 610,
      },
      { input: art, left: 139, top: 116 },
      { input: textOverlay(spell) },
      ...glyphs,
    ])
    // quality 82 matches the Summon Elemental faces: visually sharp at the on-
    // table render size while keeping each face well under ~130 KB (q95 shipped
    // ~240 KB faces and ~5.5 MB of raw art in public/ — far too heavy to serve).
    .webp({ quality: 82, effort: 6 })
    .toFile(temporary);

  await rm(destination, { force: true });
  await rename(temporary, destination);
  return destination;
}

await mkdir(OUT, { recursive: true });

const outputs = [];
for (const spell of SPELLS) outputs.push(await buildCard(spell));

const previewWidth = 223;
const previewHeight = 312;
const columns = 4;
const rows = Math.ceil(outputs.length / columns);
const gap = 12;
const previews = await Promise.all(
  outputs.map((output) =>
    sharp(output)
      .resize(previewWidth, previewHeight, { fit: "fill" })
      .png()
      .toBuffer(),
  ),
);

await sharp({
  create: {
    width: columns * previewWidth + (columns - 1) * gap,
    height: rows * previewHeight + (rows - 1) * gap,
    channels: 4,
    background: "#15110f",
  },
})
  .composite(
    previews.map((input, index) => ({
      input,
      left: (index % columns) * (previewWidth + gap),
      top: Math.floor(index / columns) * (previewHeight + gap),
    })),
  )
  .png()
  .toFile(path.join(OUT, "missing-spell-cards-contact-sheet.png"));

for (const output of outputs) console.log(path.relative(ROOT, output));

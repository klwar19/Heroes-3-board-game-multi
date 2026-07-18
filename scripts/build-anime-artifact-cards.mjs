#!/usr/bin/env node

/**
 * Build the Pháp Bảo (anime.xianxiaArtifacts) artifact CARD FACES.
 *
 * Sources (committed, regenerable):
 *   scripts/anime-art/raw/artifacts/<slug>-master.png      — frame-free illustration
 *   scripts/anime-art/raw/artifacts/frame-artifact-master.png — ornate frame whose
 *     art window is flat #00ff00 chroma-key material (codex image-gen output)
 *
 * This script:
 *   1. detects the frame's green art window rectangle programmatically,
 *   2. keys the window to transparency (fixed pure-green key, despilled) and
 *      caches scripts/anime-art/raw/artifacts/frame-artifact-keyed.png,
 *   3. writes a layered, editable SVG per card (linked art + linked keyed frame,
 *      editable title/tier/rules text) to scripts/anime-art/editable/artifacts/,
 *   4. renders the final 743×1040 webp face to public/assets/anime/artifacts/.
 *
 * Text on the face states EXACTLY the engine-wired behaviour (CLAUDE.md §2) —
 * keep it in lockstep with src/data/anime/artifacts.ts when effects change.
 *
 * Run: node scripts/build-anime-artifact-cards.mjs
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW = path.join(ROOT, "scripts", "anime-art", "raw", "artifacts");
const EDITABLE = path.join(ROOT, "scripts", "anime-art", "editable", "artifacts");
const OUT = path.join(ROOT, "public", "assets", "anime", "artifacts");
const CARD_WIDTH = 743;
const CARD_HEIGHT = 1040;
const WEBP = { quality: 88, effort: 6 };

const TIER_STYLE = {
  minor: { label: "MINOR ARTIFACT", color: "#c7ccd6" },
  major: { label: "MAJOR ARTIFACT", color: "#e7b73c" },
  relic: { label: "RELIC", color: "#6fa8ff" }
};

/** Card text = exactly the wired behaviour (src/data/anime/artifacts.ts). */
const CARDS = [
  {
    slug: "tui_can_khon",
    vi: "Túi Càn Khôn",
    en: "Cosmic Bag",
    tier: "minor",
    rules: [
      "Each Resources round: gain 1 building materials.",
      "— OR — Remove this card: gain 1 building materials and 1 valuables."
    ]
  },
  {
    slug: "tu_linh_ban",
    vi: "Tụ Linh Bàn",
    en: "Spirit Gathering Board",
    tier: "minor",
    rules: [
      "Each Resources round your main Hero is in a Town of yours: gain 2 gold.",
      "— OR — Remove this card: gain 3 gold."
    ]
  },
  {
    slug: "phong_hoa_luan",
    vi: "Phong Hỏa Luân",
    en: "Wind & Fire Wheels",
    tier: "major",
    rules: [
      "Your Hero gains +2 movement.",
      "— OR — Remove this card: your Hero gains +3 movement."
    ]
  },
  {
    slug: "bat_qua_kinh",
    vi: "Bát Quái Kính",
    en: "Bagua Mirror",
    tier: "major",
    rules: [
      "Instant — when your unit is attacked: +1 defense.",
      "— OR — Discard 1 card instead: +2 defense."
    ]
  },
  {
    slug: "tru_tien_kiem",
    vi: "Tru Tiên Kiếm",
    en: "Heaven-Slaying Sword",
    tier: "relic",
    rules: [
      "Instant — when your unit declares an attack: +2 attack.",
      "— OR — Discard 1 card instead: +3 attack."
    ]
  }
];

const xml = (value) =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function wrap(text, max = 44) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    if (line && `${line} ${word}`.length > max) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

const distToPureGreen = (r, g, b) => Math.sqrt(r * r + (255 - g) * (255 - g) + b * b);

/** Detect the flat-green window bbox and key it transparent (with despill). */
async function keyFrame(masterPath, keyedPath) {
  const { data, info } = await sharp(masterPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const T0 = 55;
  const T1 = 150;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  const out = Buffer.alloc(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    const i = p * channels;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const dist = distToPureGreen(r, g, b);
    const alpha = dist <= T0 ? 0 : dist >= T1 ? 255 : Math.round(((dist - T0) / (T1 - T0)) * 255);
    if (dist <= T0) {
      const x = p % width;
      const y = Math.floor(p / width);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const o = p * 4;
    const spillCap = Math.max(r, b);
    out[o] = r;
    out[o + 1] = alpha < 255 && g > spillCap ? spillCap : g;
    out[o + 2] = b;
    out[o + 3] = alpha;
  }
  await sharp(out, { raw: { width, height, channels: 4 } }).png().toFile(keyedPath);
  return {
    frameWidth: width,
    frameHeight: height,
    window: { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
  };
}

function cardSvg(card, artHref, frameHref, windowRect) {
  const tier = TIER_STYLE[card.tier];
  // Inset the art rect slightly past the detected window so no keyed halo shows.
  const inset = 6;
  const art = {
    x: windowRect.x - inset,
    y: windowRect.y - inset,
    w: windowRect.w + inset * 2,
    h: windowRect.h + inset * 2
  };
  const titleSize = card.vi.length > 13 ? 34 : 40;
  const panelTop = windowRect.y + windowRect.h;
  const tierY = panelTop + 74;
  const enY = tierY + 34;
  const wrapped = card.rules.map((rule) => wrap(rule));
  const totalLines = wrapped.reduce((sum, lines) => sum + lines.length, 0);
  const ruleSize = totalLines >= 8 ? 21 : 24;
  const lineHeight = ruleSize + 8;
  const rulesTop = enY + 44;
  const rulesBottom = CARD_HEIGHT - 78;
  const blockHeight = totalLines * lineHeight + (wrapped.length - 1) * 10;
  let y = rulesTop + Math.max(0, (rulesBottom - rulesTop - blockHeight) / 2);
  const ruleMarkup = wrapped
    .map((lines) => {
      const markup = lines
        .map((line, index) => `<text x="371" y="${Math.round(y + index * lineHeight)}" class="ruleText">${xml(line)}</text>`)
        .join("");
      y += lines.length * lineHeight + 10;
      return markup;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
  <title>${xml(`${card.vi} (${card.en}) — Pháp Bảo artifact card face`)}</title>
  <metadata data-layout="phap-bao-artifact-v1" data-slug="${card.slug}" data-tier="${card.tier}" data-master="${xml(`${card.slug}-master.png`)}" data-frame="frame-artifact-keyed.png" data-source="src/data/anime/artifacts.ts"/>
  <defs>
    <filter id="textShadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur in="SourceAlpha" stdDeviation="2"/><feOffset dy="2"/><feComponentTransfer><feFuncA type="linear" slope=".8"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <clipPath id="artClip"><rect x="${art.x}" y="${art.y}" width="${art.w}" height="${art.h}"/></clipPath>
    <style>
      .titleText { fill: #f2dfa4; font-family: "Times New Roman", "Liberation Serif", Georgia, serif; font-weight: 700; text-anchor: middle; filter: url(#textShadow); }
      .tierText { font-family: "Times New Roman", "Liberation Serif", Georgia, serif; font-size: 22px; font-weight: 700; letter-spacing: 4px; text-anchor: middle; filter: url(#textShadow); }
      .enText { fill: #cfc6a6; font-family: "Times New Roman", "Liberation Serif", Georgia, serif; font-size: 24px; font-style: italic; font-weight: 700; text-anchor: middle; filter: url(#textShadow); }
      .ruleText { fill: #efe3c2; font-family: "Times New Roman", "Liberation Serif", Georgia, serif; font-size: ${ruleSize}px; font-weight: 700; text-anchor: middle; filter: url(#textShadow); }
    </style>
  </defs>

  <g inkscape:groupmode="layer" inkscape:label="01 Illustration (linked master)" id="layer-art" clip-path="url(#artClip)">
    <rect x="${art.x}" y="${art.y}" width="${art.w}" height="${art.h}" fill="#151b16"/>
    <image id="linked-master" x="${art.x}" y="${art.y}" width="${art.w}" height="${art.h}" preserveAspectRatio="xMidYMid slice" href="${xml(artHref)}" xlink:href="${xml(artHref)}"/>
  </g>

  <g inkscape:groupmode="layer" inkscape:label="02 Keyed ornate frame (linked master)" id="layer-frame">
    <image id="linked-frame" x="0" y="0" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" preserveAspectRatio="none" href="${xml(frameHref)}" xlink:href="${xml(frameHref)}"/>
  </g>

  <g inkscape:groupmode="layer" inkscape:label="03 Editable typography" id="layer-type">
    <text x="371" y="93" class="titleText" font-size="${titleSize}">${xml(card.vi)}</text>
    <text x="371" y="${tierY}" class="tierText" fill="${tier.color}">${xml(tier.label)}</text>
    <text x="371" y="${enY}" class="enText">${xml(card.en)}</text>
    <g id="editable-rules">${ruleMarkup}</g>
  </g>
</svg>`;
}

async function dataUri(file) {
  const buffer = await readFile(file);
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

async function main() {
  await Promise.all([EDITABLE, OUT].map((dir) => mkdir(dir, { recursive: true })));
  const framePath = path.join(RAW, "frame-artifact-master.png");
  const keyedPath = path.join(RAW, "frame-artifact-keyed.png");
  const { frameWidth, frameHeight, window } = await keyFrame(framePath, keyedPath);
  const scaleX = CARD_WIDTH / frameWidth;
  const scaleY = CARD_HEIGHT / frameHeight;
  const windowRect = {
    x: Math.round(window.left * scaleX),
    y: Math.round(window.top * scaleY),
    w: Math.round(window.width * scaleX),
    h: Math.round(window.height * scaleY)
  };
  console.log(`frame window ${frameWidth}×${frameHeight} → card rect`, windowRect);

  const frameUri = await dataUri(keyedPath);
  for (const card of CARDS) {
    const masterFile = path.join(RAW, `${card.slug}-master.png`);
    const editableSvg = cardSvg(card, `../../raw/artifacts/${card.slug}-master.png`, "../../raw/artifacts/frame-artifact-keyed.png", windowRect);
    await writeFile(path.join(EDITABLE, `${card.slug}.svg`), editableSvg, "utf8");
    const renderSvg = cardSvg(card, await dataUri(masterFile), frameUri, windowRect);
    await sharp(Buffer.from(renderSvg)).resize(CARD_WIDTH, CARD_HEIGHT, { fit: "fill" }).webp(WEBP).toFile(path.join(OUT, `${card.slug}.webp`));
    console.log(`face  ${card.slug}.webp`);
  }
}

await main();

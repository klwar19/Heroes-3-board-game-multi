#!/usr/bin/env node
/**
 * Compose PROPER commander-artifact card faces for the grade-fill weapons
 * (Iron Cudgel / Doomsday Blade) using the same ornate artifact frame layout
 * as equipment / Pháp Bảo cards — not naked image dumps.
 *
 * Sources:
 *   public/assets/wog/artifacts/<slug>.webp  — Codex illustration (used as master)
 *   scripts/anime-art/raw/artifacts/frame-*  — shared ornate frame
 *
 * Output overwrites:
 *   public/assets/wog/artifacts/<slug>.webp
 *
 * Run: node scripts/build-commander-weapon-cards.mjs
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW = path.join(ROOT, "scripts", "anime-art", "raw", "artifacts");
const OUT = path.join(ROOT, "public", "assets", "wog", "artifacts");
const EDITABLE = path.join(ROOT, "scripts", "anime-art", "editable", "commander-weapons");
const CARD_WIDTH = 743;
const CARD_HEIGHT = 1040;
const WEBP = { quality: 90, effort: 6 };

const CARDS = [
  {
    slug: "iron_cudgel",
    en: "Iron Cudgel",
    tier: "minor",
    tierLabel: "MINOR  ·  COMMANDER WEAPON",
    tierColor: "#c7ccd6",
    rules: [
      "Commander weapon: +1 Attack.",
      "Bind permanently to your commander. This card leaves the game. Gain 1 Minor Artifact."
    ]
  },
  {
    slug: "doomsday_blade",
    en: "Doomsday Blade",
    tier: "relic",
    tierLabel: "RELIC  ·  COMMANDER WEAPON",
    tierColor: "#6fa8ff",
    rules: [
      "Commander weapon: +3 Attack.",
      "Bind permanently to your commander. This card leaves the game. Gain 1 Relic Artifact."
    ]
  }
];

const xml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function wrap(text, max = 42) {
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
  const inset = 6;
  const art = {
    x: windowRect.x - inset,
    y: windowRect.y - inset,
    w: windowRect.w + inset * 2,
    h: windowRect.h + inset * 2
  };
  const panelTop = windowRect.y + windowRect.h;
  const tierY = panelTop + 64;
  const enY = tierY + 34;
  const wrapped = card.rules.map((rule) => wrap(rule));
  const totalLines = wrapped.reduce((sum, lines) => sum + lines.length, 0);
  const ruleSize = totalLines >= 6 ? 21 : 24;
  const lineHeight = ruleSize + 8;
  const rulesTop = enY + 40;
  const rulesBottom = CARD_HEIGHT - 72;
  const blockHeight = totalLines * lineHeight + (wrapped.length - 1) * 12;
  let y = rulesTop + Math.max(0, (rulesBottom - rulesTop - blockHeight) / 2);
  const ruleMarkup = wrapped
    .map((lines, blockIndex) => {
      const markup = lines
        .map(
          (line, index) =>
            `<text x="371" y="${Math.round(y + index * lineHeight)}" class="ruleText">${xml(line)}</text>`
        )
        .join("");
      y += lines.length * lineHeight + 12;
      if (blockIndex === 0) {
        const divY = Math.round(y - 6);
        return (
          markup +
          `<line x1="120" y1="${divY}" x2="623" y2="${divY}" stroke="#6a5a32" stroke-width="1.5" opacity="0.55"/>`
        );
      }
      return markup;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
  <title>${xml(`${card.en} — commander artifact card`)}</title>
  <defs>
    <filter id="textShadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur in="SourceAlpha" stdDeviation="2"/><feOffset dy="2"/><feComponentTransfer><feFuncA type="linear" slope=".8"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <clipPath id="artClip"><rect x="${art.x}" y="${art.y}" width="${art.w}" height="${art.h}"/></clipPath>
    <style>
      .titleText { fill: #f2dfa4; font-family: "Times New Roman", Georgia, serif; font-weight: 700; font-size: 40px; text-anchor: middle; filter: url(#textShadow); }
      .tierText { font-family: "Times New Roman", Georgia, serif; font-size: 20px; font-weight: 700; letter-spacing: 3px; text-anchor: middle; filter: url(#textShadow); }
      .slotText { fill: #a89868; font-family: "Times New Roman", Georgia, serif; font-size: 18px; font-weight: 700; letter-spacing: 5px; text-anchor: middle; filter: url(#textShadow); }
      .ruleText { fill: #efe3c2; font-family: "Times New Roman", Georgia, serif; font-size: ${ruleSize}px; font-weight: 700; text-anchor: middle; filter: url(#textShadow); }
    </style>
  </defs>
  <g clip-path="url(#artClip)">
    <rect x="${art.x}" y="${art.y}" width="${art.w}" height="${art.h}" fill="#151b16"/>
    <image x="${art.x}" y="${art.y}" width="${art.w}" height="${art.h}" preserveAspectRatio="xMidYMid slice" href="${xml(artHref)}" xlink:href="${xml(artHref)}"/>
  </g>
  <image x="0" y="0" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" preserveAspectRatio="none" href="${xml(frameHref)}" xlink:href="${xml(frameHref)}"/>
  <text x="371" y="93" class="titleText">${xml(card.en)}</text>
  <text x="371" y="${tierY}" class="tierText" fill="${card.tierColor}">${xml(card.tierLabel)}</text>
  <text x="371" y="${enY}" class="slotText">WEAPON</text>
  <g>${ruleMarkup}</g>
</svg>`;
}

async function dataUri(file, mime) {
  const buffer = await readFile(file);
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

async function main() {
  await mkdir(EDITABLE, { recursive: true });
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
  const frameUri = await dataUri(keyedPath, "image/png");

  for (const card of CARDS) {
    const srcPath = path.join(OUT, `${card.slug}.webp`);
    // Crop/fit the Codex illustration into a portrait master for the art window.
    const masterPng = path.join(EDITABLE, `${card.slug}-master.png`);
    await sharp(srcPath)
      .resize(windowRect.w * 2, windowRect.h * 2, { fit: "cover", position: "centre" })
      .png()
      .toFile(masterPng);

    const svg = cardSvg(card, await dataUri(masterPng, "image/png"), frameUri, windowRect);
    await writeFile(path.join(EDITABLE, `${card.slug}.svg`), svg, "utf8");
    // Write via tmp dir + shell copy (Windows often locks public/ assets).
    const tmpDir = path.join(ROOT, "tmp", "commander-weapon-cards");
    await mkdir(tmpDir, { recursive: true });
    const tmp = path.join(tmpDir, `${card.slug}.webp`);
    await sharp(Buffer.from(svg)).resize(CARD_WIDTH, CARD_HEIGHT, { fit: "fill" }).webp(WEBP).toFile(tmp);
    const { copyFile } = await import("node:fs/promises");
    await copyFile(tmp, srcPath);
    console.log(`face  ${card.slug}.webp`);
  }
  console.log("DONE commander weapon card faces");
}

await main();

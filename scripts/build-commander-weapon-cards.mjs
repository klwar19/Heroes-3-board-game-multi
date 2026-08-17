#!/usr/bin/env node
/**
 * Compose commander-artifact card faces and the Forge icon using the same ornate artifact frame
 * layout as equipment / Pháp Bảo cards — not naked image dumps.
 *
 * Sources:
 *   scripts/anime-art/editable/commander-weapons/*-master.png — grade-fill masters
 *   scripts/anime-art/raw/artifacts/commander-masters/*.png    — bespoke masters
 *   scripts/anime-art/raw/artifacts/frame-*                    — shared ornate frame
 *
 * Output overwrites:
 *   public/assets/wog/artifacts/<slug>.webp
 *
 * Run: node scripts/build-commander-weapon-cards.mjs
 * Forge icon only: node scripts/build-commander-weapon-cards.mjs --forge-only
 */

import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
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
    slug: "sword_of_sharpness",
    outputSlug: "sword_of_sharpness_v2",
    en: "Sword of Sharpness",
    tier: "minor",
    tierLabel: "MINOR  ·  COMMANDER WEAPON",
    tierColor: "#c7ccd6",
    existingFace: true,
    rules: [
      "Commander weapon: add 1 Might die to every attack. This extra die cannot resolve as -1.",
      "Bind permanently to your commander. This card leaves the game. Gain 1 Minor Artifact."
    ]
  },
  {
    slug: "doomsday_blade",
    outputSlug: "doomsday_blade_v2",
    en: "Doomsday Blade",
    tier: "relic",
    tierLabel: "RELIC  ·  COMMANDER WEAPON",
    tierColor: "#6fa8ff",
    rules: [
      "Commander weapon: +2 Attack. Its attacks roll with advantage.",
      "Bind permanently to your commander. This card leaves the game. Gain 1 Relic Artifact."
    ]
  },
  {
    slug: "blood_patriarch_saber",
    outputSlug: "blood_patriarch_saber_v2",
    en: "Blood Patriarch's Saber",
    tier: "major",
    tierLabel: "MAJOR  ·  COMMANDER WEAPON",
    tierColor: "#e7b73c",
    rawMaster: "blood_patriarch_saber-master.png",
    rules: [
      "Commander weapon: +1 Attack. Its attacks roll with advantage.",
      "Bind permanently to your commander. This card leaves the game. Gain 1 Major Artifact."
    ]
  },
  {
    slug: "demon_heart_talisman",
    en: "Demon Heart Talisman",
    tier: "relic",
    tierLabel: "RELIC  ·  COMMANDER TRINKET",
    tierColor: "#6fa8ff",
    slotLabel: "TRINKET",
    rawMaster: "demon_heart_talisman-master.png",
    rules: [
      "Commander trinket: command cast Power +1 AND +1 Initiative.",
      "Bind permanently to your commander. This card leaves the game. Gain 1 Relic Artifact."
    ]
  },
  {
    slug: "hardened_shield", outputSlug: "hardened_shield_v2", en: "Hardened Shield", tier: "relic",
    tierLabel: "RELIC  ·  COMMANDER ARMOR", tierColor: "#6fa8ff", slotLabel: "ARMOR", existingFace: true,
    rules: ["Commander armor: +1 Defense.", "Bind permanently to your commander. This card leaves the game. Gain 1 Relic Artifact."]
  },
  {
    slug: "boots_of_haste", outputSlug: "boots_of_haste_v2", en: "Boots of Haste", tier: "minor",
    tierLabel: "MINOR  ·  COMMANDER TRINKET", tierColor: "#c7ccd6", slotLabel: "TRINKET", existingFace: true,
    rules: ["Commander trinket: +2 Initiative.", "Bind permanently to your commander. This card leaves the game. Gain 1 Minor Artifact."]
  },
  {
    slug: "vitality_ring", en: "Vitality Ring", tier: "minor",
    tierLabel: "MINOR  ·  COMMANDER TRINKET", tierColor: "#c7ccd6", slotLabel: "TRINKET", rawMaster: "vitality_ring-master.png",
    rules: ["Commander trinket: +1 Health.", "Bind permanently to your commander. This card leaves the game. Gain 1 Minor Artifact."]
  },
  {
    slug: "duelist_guard", en: "Duelist Guard", tier: "minor",
    tierLabel: "MINOR  ·  COMMANDER ARMOR", tierColor: "#c7ccd6", slotLabel: "ARMOR", rawMaster: "duelist_guard-master.png",
    rules: ["Commander armor: enemy attacks against it roll with disadvantage during combat round 1.", "Bind permanently to your commander. This card leaves the game. Gain 1 Minor Artifact."]
  },
  {
    slug: "victors_coin", en: "Victor's Coin", tier: "minor",
    tierLabel: "MINOR  ·  COMMANDER TRINKET", tierColor: "#c7ccd6", slotLabel: "TRINKET", rawMaster: "victors_coin-master.png",
    rules: ["Commander trinket: +1 gold after every combat won by this commander's main hero.", "Bind permanently to your commander. This card leaves the game. Gain 1 Minor Artifact."]
  },
  {
    slug: "veil_of_dread", en: "Veil of Dread", tier: "major",
    tierLabel: "MAJOR  ·  COMMANDER ARMOR", tierColor: "#e7b73c", slotLabel: "ARMOR", rawMaster: "veil_of_dread-master.png",
    rules: ["Commander armor: enemy attacks against it roll with disadvantage for the whole combat.", "Bind permanently to your commander. This card leaves the game. Gain 1 Major Artifact."]
  },
  {
    slug: "corrosive_edge", en: "Corrosive Edge", tier: "major",
    tierLabel: "MAJOR  ·  COMMANDER WEAPON", tierColor: "#e7b73c", rawMaster: "corrosive_edge-master.png",
    rules: ["Commander weapon: after its attack, the target gets -1 Defense for the whole combat (minimum 0).", "Bind permanently to your commander. This card leaves the game. Gain 1 Major Artifact."]
  },
  {
    slug: "enfeebling_mace", en: "Enfeebling Mace", tier: "major",
    tierLabel: "MAJOR  ·  COMMANDER WEAPON", tierColor: "#e7b73c", rawMaster: "enfeebling_mace-master.png",
    rules: ["Commander weapon: after its attack, the target gets -1 Attack for the whole combat.", "Bind permanently to your commander. This card leaves the game. Gain 1 Major Artifact."]
  },
  {
    slug: "chrono_pike", en: "Chrono Pike", tier: "major",
    tierLabel: "MAJOR  ·  COMMANDER WEAPON", tierColor: "#e7b73c", rawMaster: "chrono_pike-master.png",
    rules: ["Commander weapon: after its attack, the target gets -3 Initiative for the whole combat.", "Bind permanently to your commander. This card leaves the game. Gain 1 Major Artifact."]
  },
  {
    slug: "vampiric_fang", en: "Vampiric Fang", tier: "major",
    tierLabel: "MAJOR  ·  COMMANDER WEAPON", tierColor: "#e7b73c", rawMaster: "vampiric_fang-master.png",
    rules: ["Commander weapon: after its attack deals damage, heal 1 damage from it.", "Bind permanently to your commander. This card leaves the game. Gain 1 Major Artifact."]
  },
  {
    slug: "piercing_lance", en: "Piercing Lance", tier: "major",
    tierLabel: "MAJOR  ·  COMMANDER WEAPON", tierColor: "#e7b73c", rawMaster: "piercing_lance-master.png",
    rules: ["Commander weapon: its attacks ignore 1 Defense. This stacks with other Defense reduction.", "Bind permanently to your commander. This card leaves the game. Gain 1 Major Artifact."]
  },
  {
    slug: "barbed_carapace", en: "Barbed Carapace", tier: "major",
    tierLabel: "MAJOR  ·  COMMANDER ARMOR", tierColor: "#e7b73c", slotLabel: "ARMOR", rawMaster: "barbed_carapace-master.png",
    rules: ["Thorn Aura: after an attack damages the commander, return that exact damage to the attacker.", "Bind permanently to your commander. This card leaves the game. Gain 1 Major Artifact."]
  },
  {
    slug: "plague_censer", en: "Plague Censer", tier: "major",
    tierLabel: "MAJOR  ·  COMMANDER TRINKET", tierColor: "#e7b73c", slotLabel: "TRINKET", rawMaster: "plague_censer-master.png",
    rules: ["Commander trinket: when it activates, deal 1 damage to every adjacent unit.", "Bind permanently to your commander. This card leaves the game. Gain 1 Major Artifact."]
  },
  {
    slug: "phoenix_plate", en: "Phoenix Plate", tier: "relic",
    tierLabel: "RELIC  ·  COMMANDER ARMOR", tierColor: "#6fa8ff", slotLabel: "ARMOR", rawMaster: "phoenix_plate-master.png",
    rules: ["Once per combat, when the commander reaches 0 Health, revive it immediately at 1 Health.", "Bind permanently to your commander. This card leaves the game. Gain 1 Relic Artifact."]
  },
  {
    slug: "travelers_salve", en: "Traveler's Salve", tier: "relic",
    tierLabel: "RELIC  ·  COMMANDER TRINKET", tierColor: "#6fa8ff", slotLabel: "TRINKET", rawMaster: "travelers_salve-master.png",
    rules: ["Commander trinket: after the commander moves, heal 1 damage from it.", "Bind permanently to your commander. This card leaves the game. Gain 1 Relic Artifact."]
  },
  {
    slug: "bastion_heart", en: "Bastion Heart", tier: "relic",
    tierLabel: "RELIC  ·  COMMANDER ARMOR", tierColor: "#6fa8ff", slotLabel: "ARMOR", rawMaster: "bastion_heart-master.png",
    rules: ["Commander armor: after the commander Defends, heal 1 damage from it.", "Bind permanently to your commander. This card leaves the game. Gain 1 Relic Artifact."]
  },
  {
    slug: "stormcleaver", en: "Stormcleaver", tier: "relic",
    tierLabel: "RELIC  ·  COMMANDER WEAPON", tierColor: "#6fa8ff", rawMaster: "stormcleaver-master.png",
    rules: ["After the commander's attack, deal 1 damage to one enemy adjacent to the target.", "Bind permanently to your commander. This card leaves the game. Gain 1 Relic Artifact."]
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
  <text x="371" y="${enY}" class="slotText">${xml(card.slotLabel ?? "WEAPON")}</text>
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
    if (process.argv.includes("--forge-only")) break;
    const outputSlug = card.outputSlug ?? card.slug;
    const masterPng = path.join(EDITABLE, `${card.slug}-master.png`);
    if (card.rawMaster) {
      const sourcePath = path.join(RAW, "commander-masters", card.rawMaster);
      if (!existsSync(sourcePath)) {
        throw new Error(`Missing painted master: ${path.relative(ROOT, sourcePath)}`);
      }
      await sharp(sourcePath)
        .resize(windowRect.w * 2, windowRect.h * 2, { fit: "cover", position: "centre" })
        .png()
        .toFile(masterPng);
    } else if (card.existingFace && !existsSync(masterPng)) {
      const sourcePath = path.join(OUT, `${card.slug}.webp`);
      if (!existsSync(sourcePath)) {
        throw new Error(`Missing existing face: ${path.relative(ROOT, sourcePath)}`);
      }
      await sharp(sourcePath)
        .extract({ left: windowRect.x, top: windowRect.y, width: windowRect.w, height: windowRect.h })
        .resize(windowRect.w * 2, windowRect.h * 2, { fit: "cover" })
        .png()
        .toFile(masterPng);
    } else if (!existsSync(masterPng)) {
      throw new Error(`Missing editable master: ${path.relative(ROOT, masterPng)}`);
    }

    await sharp(masterPng)
      .resize(128, 128, { fit: "cover", position: "centre" })
      .webp(WEBP)
      .toFile(path.join(OUT, "icons", `${outputSlug}.webp`));

    const editableSvg = cardSvg(
      card,
      `${card.slug}-master.png`,
      "../../raw/artifacts/frame-artifact-keyed.png",
      windowRect
    );
    await writeFile(path.join(EDITABLE, `${card.slug}.svg`), editableSvg, "utf8");
    const renderSvg = cardSvg(card, await dataUri(masterPng, "image/png"), frameUri, windowRect);
    // Write via tmp dir + shell copy (Windows often locks public/ assets).
    const tmpDir = path.join(ROOT, "tmp", "commander-weapon-cards");
    await mkdir(tmpDir, { recursive: true });
    const tmp = path.join(tmpDir, `${outputSlug}.webp`);
    await sharp(Buffer.from(renderSvg)).resize(CARD_WIDTH, CARD_HEIGHT, { fit: "fill" }).webp(WEBP).toFile(tmp);
    const srcPath = path.join(OUT, `${outputSlug}.webp`);
    await copyFile(tmp, srcPath);
    console.log(`face  ${outputSlug}.webp`);
  }
  const forgeMaster = path.join(ROOT, "scripts", "anime-art", "raw", "ui", "commander-forge-master.png");
  if (!existsSync(forgeMaster)) throw new Error(`Missing Forge icon master: ${path.relative(ROOT, forgeMaster)}`);
  await sharp(forgeMaster)
    .resize(256, 256, { fit: "contain", position: "centre" })
    .webp(WEBP)
    .toFile(path.join(ROOT, "public", "assets", "ui", "commander-forge.webp"));
  console.log("icon  commander-forge.webp");
  console.log("DONE commander weapon card faces");
}

await main();

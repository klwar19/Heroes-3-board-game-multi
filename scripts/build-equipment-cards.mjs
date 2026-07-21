#!/usr/bin/env node
/**
 * Build PROPER equipment CARD FACES (743×1040) for every anime equipment item.
 *
 * Layout (same family as Pháp Bảo artifact cards — not a naked icon dump):
 *   1. Illustration master (equipment icon, painted into the frame art window)
 *   2. Keyed ornate artifact frame (shared HOMM3-style border)
 *   3. Editable typography: title · grade band · slot · wired rules · play line
 *
 * Sources:
 *   public/assets/anime/equipment/<slug>.webp          — inventory icons (masters)
 *   scripts/anime-art/raw/artifacts/frame-artifact-*   — ornate frame
 *
 * Outputs:
 *   scripts/anime-art/editable/equipment/<slug>.svg    — editable SVG source
 *   public/assets/anime/equipment/cards/<slug>.webp    — final card faces
 *
 * Run: node scripts/build-equipment-cards.mjs
 */

import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ICON_DIR = path.join(ROOT, "public", "assets", "anime", "equipment");
const RAW = path.join(ROOT, "scripts", "anime-art", "raw", "artifacts");
const EDITABLE = path.join(ROOT, "scripts", "anime-art", "editable", "equipment");
const OUT = path.join(ROOT, "public", "assets", "anime", "equipment", "cards");
const CARD_WIDTH = 743;
const CARD_HEIGHT = 1040;
const WEBP = { quality: 90, effort: 6 };

/** Grade → Artifact-tier chrome (same ladder as artifacts). */
const GRADE_STYLE = {
  I: { label: "GRADE I  ·  MINOR EQUIPMENT", color: "#c7ccd6", tier: "minor" },
  II: { label: "GRADE II  ·  MAJOR EQUIPMENT", color: "#e7b73c", tier: "major" },
  III: { label: "GRADE III  ·  RELIC EQUIPMENT", color: "#6fa8ff", tier: "relic" }
};

const SLOT_LABEL = {
  weapon: "WEAPON",
  armor: "ARMOR",
  accessory: "ACCESSORY",
  mount: "MOUNT"
};

/**
 * Every equipment card face. Text states EXACTLY the wired behaviour
 * (CLAUDE.md §2) + the play/remove/same-grade artifact grant.
 * Keep in lockstep with src/data/anime/equipment.ts.
 */
const CARDS = [
  // ---- Grade I -----------------------------------------------------------
  {
    slug: "iron_blood_sword",
    en: "Iron-Blood Sword",
    vi: "Thiết Huyết Kiếm",
    grade: "I",
    slot: "weapon",
    rules: [
      "Weapon: your units' FIRST declared attack each combat gets +1 Attack (main-hero fights; not retaliations).",
      "Play: equip permanently. This card leaves the game. Gain 1 Minor Artifact."
    ]
  },
  {
    slug: "black_tortoise_mail",
    en: "Black Tortoise Mail",
    vi: "Huyền Vũ Giáp",
    grade: "I",
    slot: "armor",
    rules: [
      "Armor: the FIRST enemy attack against your units each combat resolves at −1 Attack (main-hero fights).",
      "Play: equip permanently. This card leaves the game. Gain 1 Minor Artifact."
    ]
  },
  {
    slug: "adventurers_blade",
    en: "Adventurer's Blade",
    vi: "Kiếm Mạo Hiểm Giả",
    grade: "I",
    slot: "weapon",
    rules: [
      "Weapon: gain +1 gold after each combat you win.",
      "Play: equip permanently. This card leaves the game. Gain 1 Minor Artifact."
    ]
  },
  {
    slug: "guild_issue_mail",
    en: "Guild-Issue Mail",
    vi: "Giáp Công Hội",
    grade: "I",
    slot: "armor",
    rules: [
      "Armor: +1 hand limit.",
      "Play: equip permanently. This card leaves the game. Gain 1 Minor Artifact."
    ]
  },
  {
    slug: "twin_tail_ribbon",
    en: "Twin-Tail Ribbon",
    vi: "Ruy Băng Đôi",
    grade: "I",
    slot: "accessory",
    rules: [
      "Accessory: +1 hand limit.",
      "Play: equip permanently. This card leaves the game. Gain 1 Minor Artifact."
    ]
  },
  {
    slug: "lucky_coin",
    en: "Lucky Coin",
    vi: "Đồng Xu May Mắn",
    grade: "I",
    slot: "accessory",
    rules: [
      "Accessory: gain +1 gold after each combat you win.",
      "Play: equip permanently. This card leaves the game. Gain 1 Minor Artifact."
    ]
  },
  // ---- Grade II ----------------------------------------------------------
  {
    slug: "cosmos_pendant",
    en: "Cosmos Pendant",
    vi: "Càn Khôn Bội",
    grade: "II",
    slot: "accessory",
    rules: [
      "Accessory: +1 spell Power on your casts.",
      "Play: equip permanently. This card leaves the game. Gain 1 Major Artifact."
    ]
  },
  {
    slug: "supply_satchel",
    en: "Supply Satchel",
    vi: "Túi Tiếp Tế",
    grade: "II",
    slot: "accessory",
    rules: [
      "Accessory: +1 building materials at the start of each Resources round.",
      "Play: equip permanently. This card leaves the game. Gain 1 Major Artifact."
    ]
  },
  {
    slug: "windrider_saddle",
    en: "Windrider Saddle",
    vi: "Yên Ngự Phong",
    grade: "II",
    slot: "mount",
    rules: [
      "Mount: +1 movement point to your main hero at each turn refresh.",
      "Play: equip permanently. This card leaves the game. Gain 1 Major Artifact."
    ]
  },
  {
    slug: "blade_of_the_trial",
    en: "Blade of the Trial",
    vi: "Thí Luyện Kiếm",
    grade: "II",
    slot: "weapon",
    rules: [
      "Weapon: +1 Attack on your units' declared attacks during combat ROUND 1 only (not retaliations).",
      "Play: equip permanently. This card leaves the game. Gain 1 Major Artifact."
    ]
  },
  {
    slug: "veterans_standard",
    en: "Veteran's Standard",
    vi: "Quân Kỳ Lão Binh",
    grade: "II",
    slot: "accessory",
    rules: [
      "Accessory: +1 EXTRA Unit-Experience XP per won combat (needs Unit Experience).",
      "Play: equip permanently. This card leaves the game. Gain 1 Major Artifact."
    ]
  },
  {
    slug: "neon_microphone",
    en: "Neon Microphone",
    vi: "Micro Neon",
    grade: "II",
    slot: "weapon",
    rules: [
      "Weapon: your FIRST Spell each combat is cast at +1 Power (one charge per combat).",
      "Play: equip permanently. This card leaves the game. Gain 1 Major Artifact."
    ]
  },
  {
    slug: "stage_costume",
    en: "Stage Costume",
    vi: "Trang Phục Sân Khấu",
    grade: "II",
    slot: "armor",
    rules: [
      "Armor: the first time one of your units is attacked each combat, it gains a Defense token after the hit.",
      "Play: equip permanently. This card leaves the game. Gain 1 Major Artifact."
    ]
  },
  {
    slug: "spirit_focus",
    en: "Spirit Focus",
    vi: "Tụ Linh Châu",
    grade: "II",
    slot: "accessory",
    rules: [
      "Accessory: +1 spell Power on your casts.",
      "Play: equip permanently. This card leaves the game. Gain 1 Major Artifact."
    ]
  },
  // ---- Grade III ---------------------------------------------------------
  {
    slug: "marshals_war_horn",
    en: "Marshal's War Horn",
    vi: "Chiến Hào Nguyên Soái",
    grade: "III",
    slot: "accessory",
    rules: [
      "Accessory: your Commander gains the pre-combat SORT window (needs WOG Commanders).",
      "Play: equip permanently. This card leaves the game. Gain 1 Relic Artifact."
    ]
  },
  {
    slug: "spirit_crane_mount",
    en: "Spirit Crane Mount",
    vi: "Tiên Hạc Kỵ",
    grade: "III",
    slot: "mount",
    rules: [
      "Mount: if your Commander dies in a fight, it revives FREE at combat end (needs WOG Commanders).",
      "Play: equip permanently. This card leaves the game. Gain 1 Relic Artifact."
    ]
  },
  {
    slug: "alchemists_satchel",
    en: "Alchemist's Satchel",
    vi: "Túi Luyện Kim",
    grade: "III",
    slot: "armor",
    rules: [
      "Armor: +1 gold each Resources round AND +1 gold after each combat you win.",
      "Play: equip permanently. This card leaves the game. Gain 1 Relic Artifact."
    ]
  },
  {
    slug: "eternal_sash",
    en: "Eternal Sash",
    vi: "Đới Trường Sinh",
    grade: "III",
    slot: "accessory",
    rules: [
      "Accessory: +1 hand limit.",
      "Play: equip permanently. This card leaves the game. Gain 1 Relic Artifact."
    ]
  },
  // ==== Classic register line (2026-07) — 6 items for classic factions ======
  // `placeholder: true` ⇒ no hand-drawn inventory icon yet; the pipeline
  // synthesises a grade-tinted monogram master so the ornate card FACE (with
  // the full rules text) still builds. Swap in real icons + drop the flag later.
  {
    slug: "crusaders_poleaxe",
    en: "Crusader's Poleaxe",
    vi: "Đại Kích Thánh Chiến",
    grade: "I",
    slot: "weapon",
    placeholder: true,
    rules: [
      "Weapon: your units' FIRST declared attack each combat gets +1 Attack (main-hero fights; not retaliations).",
      "Play: equip permanently. This card leaves the game. Gain 1 Minor Artifact."
    ]
  },
  {
    slug: "coinward_talisman",
    en: "Coinward Talisman",
    vi: "Bùa Chiêu Tài",
    grade: "I",
    slot: "accessory",
    placeholder: true,
    rules: [
      "Accessory: gain +1 gold after each combat you win.",
      "Play: equip permanently. This card leaves the game. Gain 1 Minor Artifact."
    ]
  },
  {
    slug: "ironbark_cuirass",
    en: "Ironbark Cuirass",
    vi: "Giáp Thiết Mộc",
    grade: "II",
    slot: "armor",
    placeholder: true,
    rules: [
      "Armor: the first time one of your units is attacked each combat, it gains a Defense token after the hit.",
      "Play: equip permanently. This card leaves the game. Gain 1 Major Artifact."
    ]
  },
  {
    slug: "coursers_barding",
    en: "Courser's Barding",
    vi: "Giáp Chiến Mã",
    grade: "II",
    slot: "mount",
    placeholder: true,
    rules: [
      "Mount: +1 movement point to your main hero at each turn refresh.",
      "Play: equip permanently. This card leaves the game. Gain 1 Major Artifact."
    ]
  },
  {
    slug: "horn_of_plenty",
    en: "Horn of Plenty",
    vi: "Tù Và Sung Túc",
    grade: "III",
    slot: "accessory",
    placeholder: true,
    rules: [
      "Accessory: +1 gold after each combat you win AND +1 building materials each Resources round.",
      "Play: equip permanently. This card leaves the game. Gain 1 Relic Artifact."
    ]
  },
  {
    slug: "wardens_aegis",
    en: "Warden's Aegis",
    vi: "Thuẫn Hộ Vệ",
    grade: "III",
    slot: "armor",
    placeholder: true,
    rules: [
      "Armor: the first enemy attack against your units each combat resolves at −1 Attack, and that unit gains a Defense token after the hit.",
      "Play: equip permanently. This card leaves the game. Gain 1 Relic Artifact."
    ]
  },
  // ==== Hidden Leaf Village bespoke "shinobi" line (§3.13) — 3 items =========
  // `placeholder: true` ⇒ no hand-drawn inventory icon yet; the pipeline
  // synthesises a grade-tinted monogram master so the ornate card FACE (with the
  // full rules text) still builds. Swap in real icons + drop the flag later.
  {
    slug: "shinobi_kunai_pouch",
    en: "Kunai Pouch",
    vi: "Túi Ám Khí",
    grade: "I",
    slot: "weapon",
    placeholder: true,
    rules: [
      "Weapon: your units' FIRST declared attack each combat gets +1 Attack (main-hero fights; not retaliations).",
      "Play: equip permanently. This card leaves the game. Gain 1 Minor Artifact."
    ]
  },
  {
    slug: "body_flicker_tabi",
    en: "Body-Flicker Tabi",
    vi: "Hài Súc Địa",
    grade: "II",
    slot: "mount",
    placeholder: true,
    rules: [
      "Mount: +1 movement point to your main hero at each turn refresh.",
      "Play: equip permanently. This card leaves the game. Gain 1 Major Artifact."
    ]
  },
  {
    slug: "sage_chakra_charm",
    en: "Sage Chakra Charm",
    vi: "Linh Phù Tiên Nhân",
    grade: "III",
    slot: "accessory",
    placeholder: true,
    rules: [
      "Accessory: +1 spell Power on your casts AND +1 hand limit.",
      "Play: equip permanently. This card leaves the game. Gain 1 Relic Artifact."
    ]
  },
  // ==== Azur Lane Naval Base bespoke "kansen" line (§3.13) — 3 items =========
  // NOT placeholders: real hand-drawn naval inventory icons ship at
  // public/assets/anime/equipment/<slug>.webp (built by
  // scripts/build-kansen-equipment-icons.mjs — run it FIRST). The pipeline picks
  // them up from ICON_DIR as masters automatically; no monogram is synthesised.
  {
    slug: "oxygen_torpedo",
    en: "Oxygen Torpedo",
    vi: "Ngư Lôi Dưỡng Khí",
    grade: "I",
    slot: "weapon",
    rules: [
      "Weapon: your units' FIRST declared attack each combat gets +1 Attack (main-hero fights; not retaliations).",
      "Play: equip permanently. This card leaves the game. Gain 1 Minor Artifact."
    ]
  },
  {
    slug: "repair_toolkit",
    en: "Repair Toolkit",
    vi: "Bộ Dụng Cụ Sửa Chữa",
    grade: "II",
    slot: "armor",
    rules: [
      "Armor: the first time one of your units is attacked each combat, it gains a Defense token after the hit.",
      "Play: equip permanently. This card leaves the game. Gain 1 Major Artifact."
    ]
  },
  {
    slug: "sg_radar",
    en: "SG Radar",
    vi: "Ra-đa SG",
    grade: "III",
    slot: "accessory",
    rules: [
      "Accessory: +1 spell Power on your casts AND +1 hand limit.",
      "Play: equip permanently. This card leaves the game. Gain 1 Relic Artifact."
    ]
  }
];

/** Grade → tier tint for synthesised placeholder icons (the .tierDot palette). */
const GRADE_TINT = { I: "#b46f33", II: "#c7ccd6", III: "#e7b73c" };
const GRADE_ROMAN = { I: "I", II: "II", III: "III" };

/** Item initials for the placeholder monogram (e.g. "Crusader's Poleaxe" → "CP"). */
function monogram(en) {
  return en
    .replace(/[^A-Za-z ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

/**
 * Synthesise a 512×512 PROCEDURAL placeholder inventory icon (grade-tinted plate
 * + monogram + slot label + grade numeral) for an item that has no hand-drawn
 * icon yet, so the card-face build (and the in-game slot art) has a master.
 * Honest declaration: this is placeholder art, not an illustration.
 */
async function synthPlaceholderIcon(card, outPath) {
  const S = 512;
  const tint = GRADE_TINT[card.grade] ?? "#b46f33";
  const mono = monogram(card.en);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
    <defs>
      <radialGradient id="bg" cx="50%" cy="42%" r="62%">
        <stop offset="0%" stop-color="#20262b"/>
        <stop offset="60%" stop-color="#12161a"/>
        <stop offset="100%" stop-color="#080a0c"/>
      </radialGradient>
    </defs>
    <rect width="${S}" height="${S}" rx="46" fill="url(#bg)"/>
    <rect x="16" y="16" width="${S - 32}" height="${S - 32}" rx="34" fill="none" stroke="${tint}" stroke-width="6" opacity="0.85"/>
    <circle cx="${S / 2}" cy="228" r="132" fill="none" stroke="${tint}" stroke-width="5" opacity="0.6"/>
    <text x="${S / 2}" y="270" text-anchor="middle" font-family="'Times New Roman','Liberation Serif',Georgia,serif" font-size="150" font-weight="700" fill="${tint}" opacity="0.95">${xml(mono)}</text>
    <text x="${S / 2}" y="398" text-anchor="middle" font-family="'Times New Roman','Liberation Serif',Georgia,serif" font-size="40" font-weight="700" letter-spacing="6" fill="#d8ceb4">${xml((card.slot || "").toUpperCase())}</text>
    <text x="${S / 2}" y="454" text-anchor="middle" font-family="'Times New Roman','Liberation Serif',Georgia,serif" font-size="34" font-weight="700" letter-spacing="4" fill="${tint}">GRADE ${GRADE_ROMAN[card.grade] ?? card.grade}</text>
  </svg>`;
  await sharp(Buffer.from(svg)).resize(S, S).webp(WEBP).toFile(outPath);
}

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

/**
 * Paint the square equipment icon into a portrait master that fills the art
 * window: dark vignette, centered icon with soft plate, so it reads as a card
 * illustration not a floating PNG stamp.
 */
async function buildArtMaster(iconPath, outPath, windowW, windowH) {
  const W = Math.max(512, windowW);
  const H = Math.max(640, windowH);
  const iconSize = Math.round(Math.min(W, H) * 0.62);
  const iconBuf = await sharp(iconPath)
    .resize(iconSize, iconSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  // Radial-ish plate: dark green-black center glow matching artifact frames.
  const plate = await sharp({
    create: {
      width: W,
      height: H,
      channels: 4,
      background: { r: 18, g: 24, b: 20, alpha: 255 }
    }
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <radialGradient id="g" cx="50%" cy="42%" r="58%">
                <stop offset="0%" stop-color="#2a3a2e"/>
                <stop offset="55%" stop-color="#151b16"/>
                <stop offset="100%" stop-color="#0a0d0b"/>
              </radialGradient>
              <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#3d4a38" stop-opacity="0.55"/>
                <stop offset="100%" stop-color="#000" stop-opacity="0.7"/>
              </linearGradient>
            </defs>
            <rect width="100%" height="100%" fill="url(#g)"/>
            <rect x="0" y="0" width="100%" height="100%" fill="url(#rim)"/>
            <ellipse cx="${W / 2}" cy="${H * 0.42}" rx="${iconSize * 0.72}" ry="${iconSize * 0.72}" fill="#1a221c" stroke="#6a5a32" stroke-width="3" opacity="0.85"/>
          </svg>`
        ),
        top: 0,
        left: 0
      },
      {
        input: iconBuf,
        top: Math.round(H * 0.42 - iconSize / 2),
        left: Math.round((W - iconSize) / 2)
      }
    ])
    .png()
    .toFile(outPath);
  return plate;
}

function cardSvg(card, artHref, frameHref, windowRect) {
  const grade = GRADE_STYLE[card.grade];
  const inset = 6;
  const art = {
    x: windowRect.x - inset,
    y: windowRect.y - inset,
    w: windowRect.w + inset * 2,
    h: windowRect.h + inset * 2
  };
  const titleSize = card.en.length > 18 ? 32 : card.en.length > 14 ? 36 : 40;
  const panelTop = windowRect.y + windowRect.h;
  const gradeY = panelTop + 58;
  const slotY = gradeY + 30;
  const enY = slotY + 34;
  const wrapped = card.rules.map((rule) => wrap(rule));
  const totalLines = wrapped.reduce((sum, lines) => sum + lines.length, 0);
  const ruleSize = totalLines >= 7 ? 20 : totalLines >= 5 ? 22 : 24;
  const lineHeight = ruleSize + 7;
  const rulesTop = enY + 36;
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
      // subtle divider between effect and play line
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
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
  <title>${xml(`${card.en} — equipment card face`)}</title>
  <metadata data-layout="equipment-card-v1" data-slug="${card.slug}" data-grade="${card.grade}" data-slot="${card.slot}" data-source="src/data/anime/equipment.ts"/>
  <defs>
    <filter id="textShadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur in="SourceAlpha" stdDeviation="2"/><feOffset dy="2"/><feComponentTransfer><feFuncA type="linear" slope=".8"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <clipPath id="artClip"><rect x="${art.x}" y="${art.y}" width="${art.w}" height="${art.h}"/></clipPath>
    <style>
      .titleText { fill: #f2dfa4; font-family: "Times New Roman", "Liberation Serif", Georgia, serif; font-weight: 700; text-anchor: middle; filter: url(#textShadow); }
      .gradeText { font-family: "Times New Roman", "Liberation Serif", Georgia, serif; font-size: 20px; font-weight: 700; letter-spacing: 3px; text-anchor: middle; filter: url(#textShadow); }
      .slotText { fill: #a89868; font-family: "Times New Roman", "Liberation Serif", Georgia, serif; font-size: 18px; font-weight: 700; letter-spacing: 5px; text-anchor: middle; filter: url(#textShadow); }
      .enText { fill: #cfc6a6; font-family: "Times New Roman", "Liberation Serif", Georgia, serif; font-size: 22px; font-style: italic; font-weight: 700; text-anchor: middle; filter: url(#textShadow); }
      .ruleText { fill: #efe3c2; font-family: "Times New Roman", "Liberation Serif", Georgia, serif; font-size: ${ruleSize}px; font-weight: 700; text-anchor: middle; filter: url(#textShadow); }
    </style>
  </defs>

  <g inkscape:groupmode="layer" inkscape:label="01 Illustration" id="layer-art" clip-path="url(#artClip)">
    <rect x="${art.x}" y="${art.y}" width="${art.w}" height="${art.h}" fill="#151b16"/>
    <image id="linked-master" x="${art.x}" y="${art.y}" width="${art.w}" height="${art.h}" preserveAspectRatio="xMidYMid slice" href="${xml(artHref)}" xlink:href="${xml(artHref)}"/>
  </g>

  <g inkscape:groupmode="layer" inkscape:label="02 Keyed ornate frame" id="layer-frame">
    <image id="linked-frame" x="0" y="0" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" preserveAspectRatio="none" href="${xml(frameHref)}" xlink:href="${xml(frameHref)}"/>
  </g>

  <g inkscape:groupmode="layer" inkscape:label="03 Editable typography" id="layer-type">
    <text x="371" y="93" class="titleText" font-size="${titleSize}">${xml(card.en)}</text>
    <text x="371" y="${gradeY}" class="gradeText" fill="${grade.color}">${xml(grade.label)}</text>
    <text x="371" y="${slotY}" class="slotText">${xml(SLOT_LABEL[card.slot] ?? card.slot.toUpperCase())}</text>
    <text x="371" y="${enY}" class="enText">${xml(card.vi)}</text>
    <g id="editable-rules">${ruleMarkup}</g>
  </g>
</svg>`;
}

async function dataUri(file, mime = "image/png") {
  const buffer = await readFile(file);
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

async function main() {
  await Promise.all([EDITABLE, OUT, path.join(RAW, "equipment-masters")].map((dir) => mkdir(dir, { recursive: true })));
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
  console.log(`equipment card layout v1 — frame window →`, windowRect);

  const frameUri = await dataUri(keyedPath);
  const icons = new Set(await readdir(ICON_DIR));
  let built = 0;
  for (const card of CARDS) {
    const iconName = `${card.slug}.webp`;
    const iconPath = path.join(ICON_DIR, iconName);
    if (!icons.has(iconName)) {
      // A placeholder item (no hand-drawn icon yet) synthesises a grade-tinted
      // monogram master so its ornate card FACE still builds; a NON-placeholder
      // missing icon is a real error.
      if (card.placeholder) {
        await synthPlaceholderIcon(card, iconPath);
        icons.add(iconName);
        console.log(`icon  PLACEHOLDER  ${card.slug}.webp (synthesised)`);
      } else {
        console.error(`MISSING ICON ${iconName}`);
        process.exitCode = 1;
        continue;
      }
    }
    const masterPath = path.join(RAW, "equipment-masters", `${card.slug}-master.png`);
    await buildArtMaster(iconPath, masterPath, windowRect.w * 2, windowRect.h * 2);

    const editableSvg = cardSvg(
      card,
      `../../raw/artifacts/equipment-masters/${card.slug}-master.png`,
      "../../raw/artifacts/frame-artifact-keyed.png",
      windowRect
    );
    await writeFile(path.join(EDITABLE, `${card.slug}.svg`), editableSvg, "utf8");

    const renderSvg = cardSvg(card, await dataUri(masterPath), frameUri, windowRect);
    const outPath = path.join(OUT, `${card.slug}.webp`);
    await sharp(Buffer.from(renderSvg)).resize(CARD_WIDTH, CARD_HEIGHT, { fit: "fill" }).webp(WEBP).toFile(outPath);
    console.log(`face  ${card.grade.padEnd(3)} ${card.slot.padEnd(10)} ${card.slug}.webp`);
    built += 1;
  }
  console.log(`DONE ${built}/${CARDS.length} equipment card faces → public/assets/anime/equipment/cards/`);
  if (built !== CARDS.length) process.exit(1);
}

await main();

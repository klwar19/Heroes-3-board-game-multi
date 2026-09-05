#!/usr/bin/env node
/**
 * Azur Lane Naval Base unit cards (2026-07 real-art upgrade)
 *
 * BOARD-GAME STRUCTURE (same hierarchy every faction unit card uses):
 *   title · left 4 stats · large art · type · mid band · rules
 *   Few mid band = dual costs (Few left + Pack right); Pack mid band = # PACK only
 *
 * THEME ONLY (what is "Azur Lane"):
 *   deep-ocean navy leather, white-glove ivory, brass/gold trim, anchor seal,
 *   wake-line dividers; bronze / silver / gold metal on the same geometry.
 *   NOT Hidden Leaf green, NOT Fuyuki violet, NOT the old name-plate-only cards.
 *
 * UNLIKE Hidden Leaf, each SIDE has its own Codex-painted master (Few = base
 * skin, Pack = alt/retrofit skin of the SAME shipgirl — official refs fed to
 * image_gen via -i). Only stats / cost / rules differ beyond that.
 *
 * Masters: scripts/anime-art/raw/azur-lane/units/*-master.webp  (frame-free)
 * Icons:   scripts/anime-art/raw/azur-lane/icons/stat-*.png     (keyed, alpha)
 * Public:  public/assets/anime/units/azur-lane/
 * Review:  generated-session-art/azur-lane/cards/
 *
 * Run: node scripts/build-azur-lane-unit-cards.mjs [slug ...]
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW = path.join(ROOT, "scripts/anime-art/raw/azur-lane/units");
const ICONS_RAW = path.join(ROOT, "scripts/anime-art/raw/azur-lane/icons");
const ICONS_PUBLIC = path.join(ROOT, "public/assets/anime/icons/azur-lane");
const EDITABLE = path.join(ROOT, "scripts/anime-art/editable/azur-lane/units");
const PREVIEWS = path.join(ROOT, "scripts/anime-art/previews/azur-lane/units");
const PUBLIC = path.join(ROOT, "public/assets/anime/units/azur-lane");
const PORTRAITS = path.join(ROOT, "public/assets/anime/units/portraits");
const SESSION = path.join(ROOT, "generated-session-art/azur-lane/cards");

const CARD_W = 743;
const CARD_H = 1040;
const WEBP = { quality: 88, effort: 6 };
const ICON_PX = 52;

/** Painted Codex icons — crossed guns / armor shield / life ring / bow wake. */
const STAT_ICON_FILES = {
  attack: "stat-attack.png",
  defense: "stat-defense.png",
  health: "stat-health.png",
  initiative: "stat-initiative.png"
};

const statIconDataUri = {};

// Board-game art pocket (same family as the Hidden Leaf / classic unit cards).
const ART = { x: 173, y: 157, w: 509, h: 597 };

const TIER = {
  bronze: { label: "BRONZE", light: "#e5ad72", mid: "#9c582d", dark: "#402016" },
  silver: { label: "SILVER", light: "#e8edf5", mid: "#8794a8", dark: "#303747" },
  golden: { label: "GOLD", light: "#ffe39a", mid: "#c58c2f", dark: "#513313" }
};

/**
 * Lockstep with src/data/anime/towns.ts (stats, costs, abilityText condensed).
 * `art` names the per-side master file suffix; portraitCrop marks the sides
 * whose face crop feeds the specialty-portrait assets (Bismarck → Prinz Eugen,
 * Nagato → Yukikaze).
 */
const CARDS = [
  {
    slug: "laffey",
    name: "Laffey",
    tier: "bronze",
    kind: "GROUND",
    stats: { attack: 2, defense: 0, health: 3, initiative: 12 },
    packStats: { attack: 3, defense: 0, health: 4, initiative: 12 },
    cost: { gold: 2 },
    packCost: { gold: 4 },
    few: "No printed ability.",
    pack: "White Demon of Solomon — attacks do not provoke a Retaliation Attack."
  },
  {
    slug: "javelin",
    name: "Javelin",
    tier: "bronze",
    kind: "GROUND",
    stats: { attack: 2, defense: 1, health: 2, initiative: 7 },
    packStats: { attack: 2, initiative: 8 },
    cost: { gold: 2 },
    packCost: { gold: 4 },
    few: "No printed ability.",
    pack: "Best Friends — +1 Attack when Laffey is in the battlefield."
  },
  {
    slug: "honolulu",
    name: "Honolulu",
    tier: "bronze",
    kind: "RANGED",
    stats: { attack: 2, defense: 1, health: 2, initiative: 6 },
    packStats: { attack: 3, health: 3, initiative: 7 },
    cost: { gold: 4 },
    packCost: { gold: 6 },
    few: "Rapid Fire — ignores the adjacent-unit Combat penalty.",
    pack: "Rapid Fire — ignores the adjacent penalty; Full Barrage — after her attack, 1 damage to every other enemy adjacent to the target."
  },
  {
    slug: "unicorn",
    name: "Unicorn",
    tier: "silver",
    kind: "GROUND",
    stats: { attack: 3, defense: 2, health: 4, initiative: 5 },
    packStats: { attack: 4, health: 5, initiative: 6 },
    cost: { gold: 7 },
    packCost: { gold: 11 },
    few: "Fairy Lullaby — [activation] heal a friendly unit 2, or +1 Attack if none need healing.",
    pack: "Fairy Lullaby — [activation] heal 2; Fairy Ward — spell damage −1 for this and adjacent allies."
  },
  {
    slug: "yukikaze",
    name: "Yukikaze",
    tier: "silver",
    kind: "GROUND",
    portraitCrop: "azur-lane-yukikaze",
    packArtPosition: "top",
    stats: { attack: 3, defense: 2, health: 3, initiative: 7 },
    packStats: { attack: 4, health: 4, initiative: 8 },
    cost: { gold: 8 },
    packCost: { gold: 11 },
    few: "The Great Yukikaze — always rolls the Defend die when attacked.",
    pack: "The Great Yukikaze — Defend die when attacked; Torpedo Run — can reroll any \"-1\" on this unit's Attack die."
  },
  {
    slug: "ayanami",
    name: "Ayanami",
    tier: "silver",
    kind: "GROUND",
    stats: { attack: 3, defense: 1, health: 3, initiative: 10 },
    packStats: { attack: 4, defense: 1, health: 4, initiative: 11 },
    cost: { gold: 7 },
    packCost: { gold: 10 },
    few: "Demon's Blade — +1 Attack when she attacks after moving this activation.",
    pack: "Demon's Blade — +1 Attack when she attacks after moving; Kamikaze Torpedoes — her attacks do not provoke a Retaliation Attack."
  },
  {
    slug: "prinz-eugen",
    name: "Prinz Eugen",
    tier: "golden",
    kind: "GROUND",
    portraitCrop: "azur-lane-prinz-eugen",
    packArtPosition: "top",
    stats: { attack: 5, defense: 3, health: 7, initiative: 5 },
    packStats: { attack: 6, health: 8, initiative: 6 },
    cost: { gold: 14, valuables: 1 },
    packCost: { gold: 21, valuables: 2 },
    few: "Unsinkable — at most 4 damage from a single attack (Spells uncapped).",
    pack: "Unsinkable — ≤4 damage per attack; may Retaliate any number of times each round."
  },
  {
    slug: "i-19",
    name: "I-19",
    tier: "golden",
    kind: "GROUND",
    stats: { attack: 6, defense: 2, health: 5, initiative: 6 },
    packStats: { attack: 7, health: 6, initiative: 7 },
    cost: { gold: 14, valuables: 1 },
    packCost: { gold: 21, valuables: 2 },
    few: "Silent Hunter — no Retaliation; as a move, may surface on any empty space.",
    pack: "Silent Hunter — no Retaliation, surface anywhere; Oxygen Torpedo Spread — then strike the same target again with Attack 4."
  },
  {
    slug: "akagi",
    name: "Akagi",
    tier: "golden",
    kind: "RANGED",
    stats: { attack: 5, defense: 2, health: 5, initiative: 6 },
    packStats: { attack: 6, defense: 2, health: 6, initiative: 7 },
    cost: { gold: 15, valuables: 1 },
    packCost: { gold: 22, valuables: 2 },
    few: "Air Strike — after an attack made by this unit resolves, deal 1 damage to every other ENEMY unit adjacent to the attacked unit (not an attack: no Retaliation, not reduced by Defense).",
    pack: "Air Strike (as Few); Foxfire — an enemy that attacks Akagi in melee takes 1 damage after its attack."
  }
];

const xml = (v) =>
  String(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function wrap(value, max = 50, limit = 5) {
  const words = String(value).split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const c = line ? `${line} ${w}` : w;
    if (c.length > max && line) {
      lines.push(line);
      line = w;
    } else line = c;
  }
  if (line) lines.push(line);
  return lines.slice(0, limit);
}

function costShort(cost) {
  if (!cost) return "—";
  const g = cost.gold ?? 0;
  const v = cost.valuables ?? 0;
  if (v > 0) return `${g}+${v}`;
  return String(g);
}

function fewDualCostBand(fewCost, packCost) {
  const few = costShort(fewCost);
  const pack = costShort(packCost);
  return `
  <rect x="48" y="768" width="647" height="68" rx="8" fill="url(#band)" stroke="#c9a45a" stroke-width="3"/>
  <text x="200" y="798" class="costWellLbl">FEW</text>
  <text x="200" y="828" class="costWell">${xml(few)}</text>
  <text x="543" y="798" class="costWellLbl">PACK</text>
  <text x="543" y="828" class="costWell">${xml(pack)}</text>
  <path d="M371 780v44" stroke="#7fb6e8" stroke-opacity=".4" stroke-width="2"/>
`;
}

function packOnlyBand() {
  return `
  <rect x="48" y="768" width="647" height="68" rx="8" fill="url(#band)" stroke="#ffd45e" stroke-width="3"/>
  <path d="M60 778h623M60 826h623" stroke="#7fb6e8" stroke-opacity=".3" stroke-width="1.5"/>
  <text x="371" y="814" class="bandTxt"># PACK</text>
`;
}

function statIcon(kind, x, y) {
  const href = statIconDataUri[kind];
  const half = ICON_PX / 2;
  if (href) {
    return `<image href="${href}" xlink:href="${href}" x="${x - half}" y="${y - half}" width="${ICON_PX}" height="${ICON_PX}" preserveAspectRatio="xMidYMid meet"/>`;
  }
  return `<circle cx="${x}" cy="${y}" r="18" fill="#16263c" stroke="#f0e6b8" stroke-width="2"/>`;
}

/** Strip the flat #00ff00 chroma key a Codex icon ships with (pure-green key). */
async function keyedIconPng(src) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (g > 150 && g > r * 1.6 && g > b * 1.6) {
      data[i + 3] = 0;
    } else if (g > 100 && g > r * 1.25 && g > b * 1.25) {
      // despill halo: fade + neutralise the green fringe
      data[i + 1] = Math.round((r + b) / 2);
      data[i + 3] = Math.min(data[i + 3], 140);
    }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim({ threshold: 12 })
    .resize(128, 128, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function loadPaintedStatIcons() {
  await mkdir(ICONS_PUBLIC, { recursive: true });
  for (const [kind, file] of Object.entries(STAT_ICON_FILES)) {
    const png = await keyedIconPng(path.join(ICONS_RAW, file));
    const outWebp = path.join(ICONS_PUBLIC, file.replace(/\.png$/, ".webp"));
    await sharp(png).webp({ quality: 90 }).toFile(outWebp);
    statIconDataUri[kind] = `data:image/png;base64,${png.toString("base64")}`;
    console.log(`icon ${kind} ← ${file}`);
  }
}

function typeIcon(kind, x, y) {
  const stroke = `fill="none" stroke="#f0e6b8" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"`;
  if (kind === "RANGED") {
    // Naval gun turret, barrel raised
    return `<g transform="translate(${x} ${y})" ${stroke}>
      <path d="M-14 10h28l-4-8h-20z" fill="#f0e6b8" fill-opacity=".12"/>
      <path d="M-14 10h28l-4-8h-20z"/>
      <path d="M-6 2v-6a6 6 0 0 1 12 0v6"/>
      <path d="M2-8 14-16" stroke-width="3"/>
    </g>`;
  }
  // Ground — anchor
  return `<g transform="translate(${x} ${y})" ${stroke}>
    <circle cx="0" cy="-11" r="3.5"/>
    <path d="M0-7.5V12"/>
    <path d="M-7-2h14"/>
    <path d="M-11 6a11 11 0 0 0 22 0"/>
    <path d="M-11 6l-3-3M11 6l3-3"/>
  </g>`;
}

function anchorSeal(cx, cy, r = 18, color = "#7fb6e8") {
  return `<g transform="translate(${cx} ${cy})">
    <circle r="${r}" fill="#0e1c30" stroke="${color}" stroke-width="2.2"/>
    <g fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round">
      <circle cx="0" cy="${-r * 0.5}" r="${r * 0.16}"/>
      <path d="M0 ${-r * 0.34}V${r * 0.5}"/>
      <path d="M${-r * 0.34} ${-r * 0.05}h${r * 0.68}"/>
      <path d="M${-r * 0.5} ${r * 0.24}a${r * 0.5} ${r * 0.5} 0 0 0 ${r} 0"/>
    </g>
  </g>`;
}

/**
 * Board-game unit hierarchy + Azur Lane theme colors only.
 * Geometry mirrors the Hidden Leaf twin (classic BG structure); chrome is
 * deep-navy + ivory + brass ("white-glove Royal Navy").
 */
function boardGameNavalSvg(card, variant, artHref) {
  const tier = TIER[card.tier];
  const isPack = variant === "pack";
  const artPosition = isPack && card.packArtPosition === "top" ? "xMidYMin" : "xMidYMid";
  const variantLabel = variant.toUpperCase();
  // Pack = warm gold; Few = signal cyan (type chip accent only)
  const accent = isPack ? "#ffd45e" : "#6ec8ff";
  const stats = { ...card.stats, ...(isPack ? card.packStats : {}) };
  const rules = wrap(card[variant], 48, 5);
  const ruleFs = rules.length >= 5 ? 15 : rules.length >= 4 ? 16 : rules.length === 3 ? 18 : 20;
  const ruleLh = ruleFs + 5;
  const ruleBlock = rules.length * ruleLh;
  const ruleTop = 860 + (150 - ruleBlock) / 2 + ruleFs * 0.75;
  const titleFs = card.name.length > 16 ? 30 : card.name.length > 12 ? 34 : 40;
  const midBand = isPack ? packOnlyBand() : fewDualCostBand(card.cost, card.packCost);

  const statEntries = [
    ["attack", stats.attack],
    ["defense", stats.defense],
    ["health", stats.health],
    ["initiative", stats.initiative]
  ];
  const statCells = statEntries
    .map(([kind, value], i) => {
      const cellTop = 158 + i * 148;
      return `<g id="stat-${kind}">
        ${statIcon(kind, 118, cellTop + 44)}
        <text x="118" y="${cellTop + 112}" class="statNum">${value}</text>
      </g>`;
    })
    .join("");

  const ruleText = rules
    .map((line, i) => `<text x="384" y="${ruleTop + i * ruleLh}" class="rule">${xml(line)}</text>`)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  <title>${xml(`Azur Lane ${card.name} ${variantLabel}`)}</title>
  <metadata data-faction="azur_lane" data-layout="board-game-hierarchy-naval-theme" data-tier="${card.tier}" data-variant="${variant}" data-per-side-art="few-and-pack-distinct"/>
  <defs>
    <linearGradient id="leather" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#0c1830"/><stop offset=".45" stop-color="#1c3a5e"/><stop offset="1" stop-color="#081120"/>
    </linearGradient>
    <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="${tier.light}"/><stop offset=".4" stop-color="${tier.mid}"/><stop offset="1" stop-color="${tier.dark}"/>
    </linearGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1">
      <stop stop-color="#16304c"/><stop offset="1" stop-color="#0c1a2c"/>
    </linearGradient>
    <linearGradient id="band" x1="0" y1="0" x2="0" y2="1">
      <stop stop-color="#1a3654"/><stop offset="1" stop-color="#0e1c30"/>
    </linearGradient>
    <linearGradient id="wake" x1="0" y1="0" x2="1" y2="0">
      <stop stop-color="#6ec8ff" stop-opacity="0"/><stop offset=".5" stop-color="#bfe4ff" stop-opacity=".55"/><stop offset="1" stop-color="#ffd45e" stop-opacity="0"/>
    </linearGradient>
    <filter id="ts"><feGaussianBlur in="SourceAlpha" stdDeviation="2"/><feOffset dy="1.5"/><feComponentTransfer><feFuncA type="linear" slope=".75"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <clipPath id="artClip"><rect x="${ART.x}" y="${ART.y}" width="${ART.w}" height="${ART.h}" rx="6"/></clipPath>
    <style>
      .title { font-family: "Liberation Serif", Georgia, serif; font-weight: 700; fill: #f4ecd4; filter: url(#ts); }
      .statNum { font-family: "Liberation Serif", Georgia, serif; font-weight: 700; font-size: 38px; fill: #fef6da; text-anchor: middle; filter: url(#ts); }
      .typeLbl { font-family: Arial, sans-serif; font-weight: 700; font-size: 12px; fill: #e8f0f8; letter-spacing: 2px; filter: url(#ts); }
      .bandTxt { font-family: "Liberation Serif", Georgia, serif; font-weight: 700; font-size: 34px; fill: #f4ecd4; text-anchor: middle; filter: url(#ts); }
      .rule { font-family: "Liberation Serif", Georgia, serif; font-weight: 700; font-size: ${ruleFs}px; fill: #ecf2f8; text-anchor: middle; filter: url(#ts); }
      .costWell { font-family: "Liberation Serif", Georgia, serif; font-weight: 700; font-size: 32px; fill: #fef2c8; text-anchor: middle; filter: url(#ts); }
      .costWellLbl { font-family: Arial, sans-serif; font-weight: 700; font-size: 11px; fill: #9ec4e8; text-anchor: middle; letter-spacing: 2px; }
      .tier { font-family: "Liberation Serif", Georgia, serif; font-weight: 700; font-size: 11px; fill: ${tier.light}; text-anchor: middle; letter-spacing: 1px; }
    </style>
  </defs>

  <!-- Outer: navy leather + tier metal (board-game card proportions) -->
  <rect width="${CARD_W}" height="${CARD_H}" rx="22" fill="#050a14"/>
  <rect x="18" y="16" width="707" height="1008" rx="18" fill="url(#leather)"/>
  <rect x="26" y="24" width="691" height="992" rx="14" fill="none" stroke="url(#metal)" stroke-width="8"/>
  <rect x="36" y="34" width="671" height="972" rx="10" fill="none" stroke="#eef4ff" stroke-opacity=".2" stroke-width="1.5"/>
  <!-- Soft cyan/gold wake rim (naval feel, still subtle) -->
  <rect x="40" y="38" width="663" height="964" rx="9" fill="none" stroke="url(#wake)" stroke-width="2" opacity=".7"/>

  <!-- Title bar + anchor seal -->
  <rect x="48" y="44" width="647" height="92" rx="8" fill="url(#panel)" stroke="url(#metal)" stroke-width="4"/>
  <path d="M56 52h631M56 128h631" stroke="#7fb6e8" stroke-opacity=".32" stroke-width="1.5"/>
  ${anchorSeal(78, 90, 20)}
  <text x="390" y="100" class="title" font-size="${titleFs}" text-anchor="middle">${xml(card.name)}</text>
  <!-- Tier badge: metal disc + compass pip -->
  <g transform="translate(648 90)">
    <circle r="24" fill="${tier.dark}" stroke="${tier.light}" stroke-width="3"/>
    <circle r="10" fill="none" stroke="${tier.light}" stroke-width="1.5" opacity=".7"/>
    <path d="M0-9 2.5 0 0 9-2.5 0Z" fill="#6ec8ff"/>
    <circle r="2.2" fill="#ffd45e" stroke="none"/>
  </g>
  <text x="648" y="124" class="tier">${tier.label}</text>

  <!-- Left stat rail -->
  <rect x="48" y="148" width="112" height="610" rx="8" fill="url(#panel)" stroke="url(#metal)" stroke-width="4"/>
  ${[296, 444, 592].map((y) => `<path d="M54 ${y}h100" stroke="#7fb6e8" stroke-opacity=".3" stroke-width="2"/>`).join("")}
  ${statCells}

  <!-- Art window -->
  <rect x="${ART.x - 2}" y="${ART.y - 2}" width="${ART.w + 4}" height="${ART.h + 4}" rx="8" fill="#0a1424" stroke="url(#metal)" stroke-width="4"/>
  <g clip-path="url(#artClip)">
    <rect x="${ART.x}" y="${ART.y}" width="${ART.w}" height="${ART.h}" fill="#0e1c2e"/>
    <image x="${ART.x}" y="${ART.y}" width="${ART.w}" height="${ART.h}" preserveAspectRatio="${artPosition} slice" href="${xml(artHref)}" xlink:href="${xml(artHref)}"/>
  </g>
  <!-- Type chip -->
  <g id="type">
    <rect x="180" y="164" width="118" height="36" rx="8" fill="#0a1626" fill-opacity=".88" stroke="${accent}" stroke-width="1.6"/>
    ${typeIcon(card.kind, 198, 182)}
    <text x="248" y="187" class="typeLbl">${card.kind}</text>
  </g>

  <!-- Mid band: Few = dual costs (Few|Pack); Pack = # PACK only (no cost) -->
  ${midBand}

  <!-- Rules -->
  <rect x="48" y="846" width="647" height="160" rx="8" fill="url(#panel)" stroke="url(#metal)" stroke-width="3"/>
  ${ruleText}
</svg>`;
}

function masterPathFor(card, variant) {
  return path.join(RAW, `units-azur-lane-${card.tier}-${card.slug}-${variant}-master.webp`);
}

async function buildCard(card, variant) {
  const masterPath = masterPathFor(card, variant);
  const fileBase = `units-azur-lane-${card.tier}-${card.slug}-${variant}`;
  // A caller can use a suffix to write a fresh editable/preview pair when a
  // desktop image viewer has the normal preview file open on Windows. Public
  // and session outputs retain their stable names.
  const buildSuffix = process.env.AZUR_LANE_BUILD_SUFFIX ?? "";
  const renderBase = `${fileBase}${buildSuffix}`;
  const svgPath = path.join(EDITABLE, `${renderBase}.svg`);
  const previewPath = path.join(PREVIEWS, `${renderBase}.webp`);
  const publicPath = path.join(PUBLIC, `${fileBase}.webp`);
  const sessionPath = path.join(SESSION, `${fileBase}.webp`);

  const relHref = path.relative(EDITABLE, masterPath).split(path.sep).join("/");
  await writeFile(svgPath, boardGameNavalSvg(card, variant, relHref), "utf8");

  const artBuf = await sharp(masterPath)
    .resize(ART.w, ART.h, { fit: "cover", position: variant === "pack" && card.packArtPosition === "top" ? "top" : "attention" })
    .png()
    .toBuffer();
  const dataHref = `data:image/png;base64,${artBuf.toString("base64")}`;
  await sharp(Buffer.from(boardGameNavalSvg(card, variant, dataHref)), { density: 96 })
    .resize(CARD_W, CARD_H)
    .webp(WEBP)
    .toFile(previewPath);
  await sharp(previewPath).webp(WEBP).toFile(publicPath);
  await sharp(previewPath).webp(WEBP).toFile(sessionPath);
  return fileBase;
}

/**
 * Specialty portraits (Bismarck → Prinz Eugen, Nagato → Yukikaze): a face crop
 * from the FEW master, sized to the existing portrait convention.
 */
async function buildPortrait(card) {
  if (!card.portraitCrop) return;
  const masterPath = masterPathFor(card, "few");
  const meta = await sharp(masterPath).metadata();
  const cropW = Math.round(meta.width * 0.42);
  const cropH = cropW;
  const left = Math.round((meta.width - cropW) / 2);
  const top = Math.round(meta.height * 0.06);
  const out = path.join(PORTRAITS, `${card.portraitCrop}.webp`);
  await sharp(masterPath)
    .extract({ left, top, width: cropW, height: cropH })
    .resize(200, 200, { fit: "cover" })
    .webp({ quality: 88 })
    .toFile(out);
  console.log(`portrait ${card.portraitCrop} ← ${path.basename(masterPath)}`);
}

async function main() {
  await Promise.all([
    mkdir(RAW, { recursive: true }),
    mkdir(EDITABLE, { recursive: true }),
    mkdir(PREVIEWS, { recursive: true }),
    mkdir(PUBLIC, { recursive: true }),
    mkdir(PORTRAITS, { recursive: true }),
    mkdir(SESSION, { recursive: true })
  ]);

  await loadPaintedStatIcons();

  const req = new Set(process.argv.slice(2));
  const selected = req.size ? CARDS.filter((c) => req.has(c.slug)) : CARDS;
  if (!selected.length) throw new Error(`No slugs: ${[...req].join(", ")}`);

  let missing = 0;
  for (const card of selected) {
    for (const v of ["few", "pack"]) {
      try {
        await sharp(masterPathFor(card, v)).metadata();
      } catch {
        console.error(`MISSING MASTER: ${path.basename(masterPathFor(card, v))}`);
        missing++;
        continue;
      }
      console.log(`OK ${await buildCard(card, v)}`);
    }
    await buildPortrait(card);
  }
  if (missing) process.exitCode = 1;
  console.log(`\nReview: generated-session-art/azur-lane/cards/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

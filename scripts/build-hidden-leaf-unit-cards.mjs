#!/usr/bin/env node
/**
 * Hidden Leaf Village unit cards
 *
 * BOARD-GAME STRUCTURE (same hierarchy every faction unit card uses):
 *   title · left 4 stats · large art · type · mid band · rules
 *   Few mid band = dual costs (Few left + Pack right); Pack mid band = # PACK only
 *
 * THEME ONLY (what is "Hidden Leaf"):
 *   forest-green leather, slate, parchment cream, leaf-seal accents
 *   bronze / silver / gold metal on the same geometry
 *   NOT Fuyuki violet nocturne, NOT Azure jade, NOT raw units-blank classic,
 *   NOT invented horizontal-stat "mission scroll" layouts
 *
 * Few + Pack of one line share ONE art master; only stats / cost / rules differ.
 *
 * Masters: scripts/anime-art/raw/hidden-leaf/units/*-master.png  (frame-free)
 * Public:  public/assets/anime/units/hidden-leaf/
 * Review:  generated-session-art/hidden-leaf/cards/
 *
 * Run: node scripts/build-hidden-leaf-unit-cards.mjs [slug ...]
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW = path.join(ROOT, "scripts/anime-art/raw/hidden-leaf/units");
const ICONS_RAW = path.join(ROOT, "scripts/anime-art/raw/hidden-leaf/icons");
const ICONS_PUBLIC = path.join(ROOT, "public/assets/anime/icons/hidden-leaf");
const EDITABLE = path.join(ROOT, "scripts/anime-art/editable/hidden-leaf/units");
const PREVIEWS = path.join(ROOT, "scripts/anime-art/previews/hidden-leaf/units");
const PUBLIC = path.join(ROOT, "public/assets/anime/units/hidden-leaf");
const SESSION = path.join(ROOT, "generated-session-art/hidden-leaf/cards");

const CARD_W = 743;
const CARD_H = 1040;
const WEBP = { quality: 88, effort: 6 };
const ICON_PX = 52; // on-card size

/** Painted Codex icons — kunai / shield / leaf / ninja-move. */
const STAT_ICON_FILES = {
  attack: "stat-attack-kunai.png",
  defense: "stat-defend-shield.png",
  health: "stat-health-leaf.png",
  initiative: "stat-speed-ninja-move.png"
};

/** Filled at startup: kind → data:image/png;base64,... */
const statIconDataUri = {};

// Board-game art pocket (same family as Azure / classic unit cards).
const ART = { x: 173, y: 157, w: 509, h: 597 };

const TIER = {
  bronze: { label: "BRONZE", light: "#e5ad72", mid: "#9c582d", dark: "#402016" },
  silver: { label: "SILVER", light: "#e8edf5", mid: "#8794a8", dark: "#303747" },
  golden: { label: "GOLD", light: "#ffe39a", mid: "#c58c2f", dark: "#513313" }
};

/** Lockstep with src/data/anime/towns.ts */
const CARDS = [
  {
    slug: "genin-squad",
    name: "Academy Genin",
    tier: "bronze",
    kind: "GROUND",
    art: "units-hidden-leaf-bronze-genin-squad-master.png",
    stats: { attack: 2, defense: 1, health: 2, initiative: 7 },
    packStats: { health: 3, initiative: 8 },
    cost: { gold: 2 },
    packCost: { gold: 4 },
    few: "No printed ability.",
    pack: "Shadow Clone Formation — +1 Attack on this unit's own attacks, never on Retaliation."
  },
  {
    slug: "medical-nin",
    name: "Sakura's Medical Corps",
    tier: "bronze",
    kind: "GROUND",
    art: "units-hidden-leaf-bronze-medical-nin-master.png",
    stats: { attack: 1, defense: 1, health: 3, initiative: 6 },
    packStats: { attack: 2, defense: 2 },
    cost: { gold: 3 },
    packCost: { gold: 5 },
    few: "No printed ability.",
    pack: "Mystical Palm — heal another friendly unit 2; if none can be healed, gain +1 Attack this round."
  },
  {
    slug: "anbu",
    name: "ANBU Black Ops",
    tier: "bronze",
    kind: "RANGED",
    art: "units-hidden-leaf-bronze-anbu-master.png",
    stats: { attack: 2, defense: 1, health: 2, initiative: 8 },
    packStats: { attack: 3, defense: 2, health: 3, initiative: 9 },
    cost: { gold: 4 },
    packCost: { gold: 7 },
    few: "Shadow Step — ignores the adjacent ranged Combat penalty.",
    pack: "Body Flicker — ignores the adjacent ranged penalty; may move to any empty space."
  },
  {
    slug: "jonin",
    name: "Leaf Jōnin",
    tier: "silver",
    kind: "RANGED",
    art: "units-hidden-leaf-silver-jonin-master.png",
    stats: { attack: 3, defense: 2, health: 4, initiative: 6 },
    packStats: { attack: 4, initiative: 7 },
    cost: { gold: 8 },
    packCost: { gold: 11 },
    few: "Kunai Barrage — ignores the adjacent-unit Combat penalty.",
    pack: "Jōnin Mastery — ignores all ranged penalties; never provokes Retaliation."
  },
  {
    slug: "giant-toad",
    name: "Gamabunta",
    tier: "silver",
    kind: "GROUND",
    art: "units-hidden-leaf-silver-giant-toad-master.png",
    stats: { attack: 3, defense: 3, health: 5, initiative: 4 },
    packStats: { attack: 4, health: 6, initiative: 5 },
    cost: { gold: 9 },
    packCost: { gold: 13 },
    few: "Toad Hide — always rolls the Defend die when attacked.",
    pack: "Toad Hide — Defend die; Smoke Bomb — on defeat, 1 damage to every adjacent unit."
  },
  {
    slug: "jinchuriki",
    name: "Nine-Tails Chakra Avatar",
    tier: "golden",
    kind: "GROUND",
    art: "units-hidden-leaf-golden-jinchuriki-master.png",
    stats: { attack: 5, defense: 2, health: 6, initiative: 6 },
    packStats: { attack: 6, defense: 3, health: 7, initiative: 8 },
    cost: { gold: 15, valuables: 1 },
    packCost: { gold: 24, valuables: 2 },
    few: "Chakra Burst — after own attack, 1 damage to every other adjacent unit (friend and foe).",
    pack: "Tailed-Beast Cloak — after attacking, separately attack every other adjacent enemy; no Retaliation or chaining."
  },
  {
    slug: "susanoo",
    name: "Perfect Susanoo",
    tier: "golden",
    kind: "GROUND",
    art: "units-hidden-leaf-golden-susanoo-master.png",
    stats: { attack: 5, defense: 3, health: 7, initiative: 4 },
    packStats: { attack: 6, defense: 4, health: 8, initiative: 5 },
    cost: { gold: 16, valuables: 1 },
    packCost: { gold: 25, valuables: 2 },
    few: "Ethereal Armor — at most 4 damage from a single attack (Spells uncapped).",
    pack: "Perfect Armor — ≤4 damage per attack; ignore ongoing effects on this unit."
  },
  {
    slug: "hokage-vanguard",
    name: "Hokage Vanguard",
    tier: "golden",
    kind: "GROUND",
    art: "units-hidden-leaf-golden-hokage-vanguard-master.png",
    stats: { attack: 5, defense: 2, health: 6, initiative: 7 },
    packStats: { attack: 6, health: 8, initiative: 8 },
    cost: { gold: 13, valuables: 2 },
    packCost: { gold: 21, valuables: 3 },
    few: "Flying Raijin Formation — may move to any empty space.",
    pack: "Four Hokage Formation — may move anywhere; always rolls the Defend die when attacked."
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

/** Printed-card cost text: gold number, optional +valuables (e.g. "14" or "14+1"). */
function costShort(cost) {
  if (!cost) return "—";
  const g = cost.gold ?? 0;
  const v = cost.valuables ?? 0;
  if (v > 0) return `${g}+${v}`;
  return String(g);
}

/**
 * Board-game Few band: TWO cost wells (Few left, Pack right) — same idea as
 * printed faction unit cards. Pack cards do NOT show cost (only # PACK).
 */
function fewDualCostBand(fewCost, packCost) {
  const few = costShort(fewCost);
  const pack = costShort(packCost);
  return `
  <rect x="48" y="768" width="647" height="68" rx="8" fill="url(#band)" stroke="#c9a45a" stroke-width="3"/>
  <!-- Few cost (left well) -->
  <text x="200" y="798" class="costWellLbl">FEW</text>
  <text x="200" y="828" class="costWell">${xml(few)}</text>
  <!-- Pack cost (right well) -->
  <text x="543" y="798" class="costWellLbl">PACK</text>
  <text x="543" y="828" class="costWell">${xml(pack)}</text>
  <!-- Center divider only — no # FEW word; the dual costs mark the Few face -->
  <path d="M371 780v44" stroke="#7fce6a" stroke-opacity=".35" stroke-width="2"/>
`;
}

function packOnlyBand() {
  return `
  <rect x="48" y="768" width="647" height="68" rx="8" fill="url(#band)" stroke="#ffb84a" stroke-width="3"/>
  <path d="M60 778h623M60 826h623" stroke="#7fce6a" stroke-opacity=".28" stroke-width="1.5"/>
  <text x="371" y="814" class="bandTxt"># PACK</text>
`;
}

/**
 * Real painted stat icons (Codex art), not line doodles.
 * Attack=kunai · Defense=shield · Health=leaf · Initiative=ninja move.
 */
function statIcon(kind, x, y) {
  const href = statIconDataUri[kind];
  const half = ICON_PX / 2;
  if (href) {
    return `<image href="${href}" xlink:href="${href}" x="${x - half}" y="${y - half}" width="${ICON_PX}" height="${ICON_PX}" preserveAspectRatio="xMidYMid meet"/>`;
  }
  // Fallback if a master icon file is missing (should not happen in full builds).
  return `<circle cx="${x}" cy="${y}" r="18" fill="#2a3a28" stroke="#f0e6b8" stroke-width="2"/>`;
}

async function loadPaintedStatIcons() {
  await mkdir(ICONS_PUBLIC, { recursive: true });
  for (const [kind, file] of Object.entries(STAT_ICON_FILES)) {
    const src = path.join(ICONS_RAW, file);
    // Clean to a tight 128px icon, dark-bg friendly for the rail.
    const outWebp = path.join(ICONS_PUBLIC, file.replace(/\.png$/, ".webp"));
    let png;
    let publishIcon = true;
    try {
      png = await sharp(src)
        .resize(128, 128, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
    } catch {
      // Older checkouts retain only the published WebP icons. They are lossless
      // enough for a 52px stat rail and keep card rebuilding reproducible.
      png = await sharp(outWebp)
        .resize(128, 128, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
      publishIcon = false;
    }
    if (publishIcon) await sharp(png).webp({ quality: 90 }).toFile(outWebp);
    statIconDataUri[kind] = `data:image/png;base64,${png.toString("base64")}`;
    console.log(`icon ${kind} ← ${file}`);
  }
}

function typeIcon(kind, x, y) {
  const stroke = `fill="none" stroke="#f0e6b8" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"`;
  if (kind === "RANGED") {
    // Shuriken
    return `<g transform="translate(${x} ${y})" ${stroke}>
      <path d="M0-16 4-4 16 0 4 4 0 16-4 4-16 0-4-4Z" fill="#f0e6b8" fill-opacity=".12"/>
      <path d="M0-16 4-4 16 0 4 4 0 16-4 4-16 0-4-4Z"/>
      <circle r="3.5" fill="#1a2a1c" stroke="#ff9a4a" stroke-width="2"/>
    </g>`;
  }
  // Ground — ninja sandal + leg wrap
  return `<g transform="translate(${x} ${y})" ${stroke}>
    <path d="M-12-16h10v18c5 4 12 6 18 6v8H-16v-6c5-2 7-6 4-12z" fill="#f0e6b8" fill-opacity=".1"/>
    <path d="M-12-16h10v18c5 4 12 6 18 6v8H-16v-6c5-2 7-6 4-12z"/>
    <path d="M-8-6h8M-8 2h8" stroke="#7fce6a" stroke-width="2"/>
  </g>`;
}

function spiralSeal(cx, cy, r = 18, color = "#7fce6a") {
  return `<g transform="translate(${cx} ${cy})">
    <circle r="${r}" fill="#152018" stroke="${color}" stroke-width="2.2"/>
    <path d="M0-${r * 0.55}a${r * 0.55} ${r * 0.55} 0 1 1-${r * 0.35} ${r * 0.9}" fill="none" stroke="${color}" stroke-width="2"/>
    <circle r="2.5" fill="${color}" stroke="none"/>
  </g>`;
}

/**
 * Board-game unit hierarchy + Hidden Leaf theme colors only.
 * Geometry mirrors Azure ninefold (classic BG structure), chrome is leaf-green.
 */
function boardGameLeafSvg(card, variant, artHref) {
  const tier = TIER[card.tier];
  const isPack = variant === "pack";
  const variantLabel = variant.toUpperCase();
  // Pack = warmer gold; Few = cyan chakra (type chip only)
  const accent = isPack ? "#ffb84a" : "#6ec8ff";
  const stats = { ...card.stats, ...(isPack ? card.packStats : {}) };
  // Rules sit in the bottom panel; FEW has dual costs in the mid band (game card),
  // PACK has no cost at all — only # PACK.
  const rules = wrap(card[variant], 48, 5);
  const ruleFs = rules.length >= 5 ? 15 : rules.length >= 4 ? 16 : rules.length === 3 ? 18 : 20;
  const ruleLh = ruleFs + 5;
  const ruleBlock = rules.length * ruleLh;
  // Bottom panel is taller now that the separate COST strip is gone.
  const ruleTop = 860 + (150 - ruleBlock) / 2 + ruleFs * 0.75;
  const titleFs = card.name.length > 16 ? 30 : card.name.length > 12 ? 34 : 40;
  const midBand = isPack
    ? packOnlyBand()
    : fewDualCostBand(card.cost, card.packCost);

  const statEntries = [
    ["attack", stats.attack],
    ["defense", stats.defense],
    ["health", stats.health],
    ["initiative", stats.initiative]
  ];
  const statCells = statEntries
    .map(([kind, value], i) => {
      const cellTop = 158 + i * 148;
      // Icon sits in the upper half of the cell; number below (board-game pocket).
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
  <title>${xml(`Hidden Leaf ${card.name} ${variantLabel}`)}</title>
  <metadata data-faction="hidden_leaf" data-layout="board-game-hierarchy-shinobi-theme" data-tier="${card.tier}" data-variant="${variant}" data-shared-art="few-and-pack"/>
  <defs>
    <linearGradient id="leather" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#14241a"/><stop offset=".45" stop-color="#2a4a32"/><stop offset="1" stop-color="#0e1610"/>
    </linearGradient>
    <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="${tier.light}"/><stop offset=".4" stop-color="${tier.mid}"/><stop offset="1" stop-color="${tier.dark}"/>
    </linearGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1">
      <stop stop-color="#1e3224"/><stop offset="1" stop-color="#121c14"/>
    </linearGradient>
    <linearGradient id="band" x1="0" y1="0" x2="0" y2="1">
      <stop stop-color="#243828"/><stop offset="1" stop-color="#152018"/>
    </linearGradient>
    <linearGradient id="chakra" x1="0" y1="0" x2="1" y2="0">
      <stop stop-color="#ff7a2a" stop-opacity=".0"/><stop offset=".5" stop-color="#ff9a4a" stop-opacity=".55"/><stop offset="1" stop-color="#6ec8ff" stop-opacity=".0"/>
    </linearGradient>
    <filter id="ts"><feGaussianBlur in="SourceAlpha" stdDeviation="2"/><feOffset dy="1.5"/><feComponentTransfer><feFuncA type="linear" slope=".75"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <clipPath id="artClip"><rect x="${ART.x}" y="${ART.y}" width="${ART.w}" height="${ART.h}" rx="6"/></clipPath>
    <style>
      .title { font-family: "Liberation Serif", Georgia, serif; font-weight: 700; fill: #ffe9b0; filter: url(#ts); }
      .statNum { font-family: "Liberation Serif", Georgia, serif; font-weight: 700; font-size: 38px; fill: #fff4d0; text-anchor: middle; filter: url(#ts); }
      .typeLbl { font-family: Arial, sans-serif; font-weight: 700; font-size: 12px; fill: #e8f0d8; letter-spacing: 2px; filter: url(#ts); }
      .bandTxt { font-family: "Liberation Serif", Georgia, serif; font-weight: 700; font-size: 34px; fill: #ffe9b0; text-anchor: middle; filter: url(#ts); }
      .rule { font-family: "Liberation Serif", Georgia, serif; font-weight: 700; font-size: ${ruleFs}px; fill: #f3e8c7; text-anchor: middle; filter: url(#ts); }
      .costWell { font-family: "Liberation Serif", Georgia, serif; font-weight: 700; font-size: 32px; fill: #fff2c4; text-anchor: middle; filter: url(#ts); }
      .costWellLbl { font-family: Arial, sans-serif; font-weight: 700; font-size: 11px; fill: #a8c98a; text-anchor: middle; letter-spacing: 2px; }
      .tier { font-family: "Liberation Serif", Georgia, serif; font-weight: 700; font-size: 11px; fill: ${tier.light}; text-anchor: middle; letter-spacing: 1px; }
    </style>
  </defs>

  <!-- Outer: leaf leather + tier metal (board-game card proportions) -->
  <rect width="${CARD_W}" height="${CARD_H}" rx="22" fill="#080e0a"/>
  <rect x="18" y="16" width="707" height="1008" rx="18" fill="url(#leather)"/>
  <rect x="26" y="24" width="691" height="992" rx="14" fill="none" stroke="url(#metal)" stroke-width="8"/>
  <rect x="36" y="34" width="671" height="972" rx="10" fill="none" stroke="#ff9a4a" stroke-opacity=".22" stroke-width="1.5"/>
  <!-- Soft orange/cyan chakra rim (shinobi feel, still subtle) -->
  <rect x="40" y="38" width="663" height="964" rx="9" fill="none" stroke="url(#chakra)" stroke-width="2" opacity=".7"/>

  <!-- Title bar + spiral seal (not a plain star) -->
  <rect x="48" y="44" width="647" height="92" rx="8" fill="url(#panel)" stroke="url(#metal)" stroke-width="4"/>
  <path d="M56 52h631M56 128h631" stroke="#7fce6a" stroke-opacity=".3" stroke-width="1.5"/>
  ${spiralSeal(78, 90, 20, "#7fce6a")}
  <text x="390" y="100" class="title" font-size="${titleFs}" text-anchor="middle">${xml(card.name)}</text>
  <!-- Tier badge: metal disc + seal pip -->
  <g transform="translate(648 90)">
    <circle r="24" fill="${tier.dark}" stroke="${tier.light}" stroke-width="3"/>
    <circle r="10" fill="none" stroke="${tier.light}" stroke-width="1.5" opacity=".7"/>
    <path d="M0-8a8 8 0 1 1-4 12" fill="none" stroke="#ff9a4a" stroke-width="2"/>
    <circle r="2.5" fill="#ff9a4a" stroke="none"/>
  </g>
  <text x="648" y="124" class="tier">${tier.label}</text>

  <!-- Left stat rail -->
  <rect x="48" y="148" width="112" height="610" rx="8" fill="url(#panel)" stroke="url(#metal)" stroke-width="4"/>
  ${[296, 444, 592].map((y) => `<path d="M54 ${y}h100" stroke="#7fce6a" stroke-opacity=".28" stroke-width="2"/>`).join("")}
  ${statCells}

  <!-- Art window -->
  <rect x="${ART.x - 2}" y="${ART.y - 2}" width="${ART.w + 4}" height="${ART.h + 4}" rx="8" fill="#0c140e" stroke="url(#metal)" stroke-width="4"/>
  <g clip-path="url(#artClip)">
    <rect x="${ART.x}" y="${ART.y}" width="${ART.w}" height="${ART.h}" fill="#121a14"/>
    <image x="${ART.x}" y="${ART.y}" width="${ART.w}" height="${ART.h}" preserveAspectRatio="xMidYMid slice" href="${xml(artHref)}" xlink:href="${xml(artHref)}"/>
  </g>
  <!-- Type chip -->
  <g id="type">
    <rect x="180" y="164" width="118" height="36" rx="8" fill="#0f1a12" fill-opacity=".88" stroke="${accent}" stroke-width="1.6"/>
    ${typeIcon(card.kind, 198, 182)}
    <text x="248" y="187" class="typeLbl">${card.kind}</text>
  </g>

  <!-- Mid band: Few = dual costs (Few|Pack); Pack = # PACK only (no cost) -->
  ${midBand}

  <!-- Rules (bottom panel — no separate cost strip; costs live on Few band only) -->
  <rect x="48" y="846" width="647" height="160" rx="8" fill="url(#panel)" stroke="url(#metal)" stroke-width="3"/>
  ${ruleText}
</svg>`;
}

async function buildCard(card, variant) {
  const masterPath = path.join(RAW, card.art);
  const relHref = path.relative(EDITABLE, masterPath).split(path.sep).join("/");
  const fileBase = `units-hidden-leaf-${card.tier}-${card.slug}-${variant}`;
  const svgPath = path.join(EDITABLE, `${fileBase}.svg`);
  const previewPath = path.join(PREVIEWS, `${fileBase}.webp`);
  const publicPath = path.join(PUBLIC, `${fileBase}.webp`);
  const sessionPath = path.join(SESSION, `${fileBase}.webp`);

  await writeFile(svgPath, boardGameLeafSvg(card, variant, relHref), "utf8");

  const artBuf = await sharp(masterPath)
    .resize(ART.w, ART.h, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();
  const dataHref = `data:image/png;base64,${artBuf.toString("base64")}`;
  await sharp(Buffer.from(boardGameLeafSvg(card, variant, dataHref)), { density: 96 })
    .resize(CARD_W, CARD_H)
    .webp(WEBP)
    .toFile(previewPath);
  await sharp(previewPath).webp(WEBP).toFile(publicPath);
  await sharp(previewPath).webp(WEBP).toFile(sessionPath);
  return fileBase;
}

async function main() {
  await Promise.all([
    mkdir(RAW, { recursive: true }),
    mkdir(EDITABLE, { recursive: true }),
    mkdir(PREVIEWS, { recursive: true }),
    mkdir(PUBLIC, { recursive: true }),
    mkdir(SESSION, { recursive: true })
  ]);

  await loadPaintedStatIcons();

  const req = new Set(process.argv.slice(2));
  const selected = req.size ? CARDS.filter((c) => req.has(c.slug)) : CARDS;
  if (!selected.length) throw new Error(`No slugs: ${[...req].join(", ")}`);

  let missing = 0;
  for (const card of selected) {
    try {
      await sharp(path.join(RAW, card.art)).metadata();
    } catch {
      console.error(`MISSING MASTER: ${card.art}`);
      missing++;
      continue;
    }
    for (const v of ["few", "pack"]) {
      console.log(`OK ${await buildCard(card, v)}`);
    }
  }
  if (missing) process.exitCode = 1;
  console.log(`\nReview: generated-session-art/hidden-leaf/cards/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

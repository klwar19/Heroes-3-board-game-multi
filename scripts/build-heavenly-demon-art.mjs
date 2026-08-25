#!/usr/bin/env node

// OFFLINE compositor for the full Heavenly Demon Palace (`heavenly_demon`)
// anime-town art suite. Reads the REAL Codex-generated character/scene masters
// under scripts/anime-art/raw/heavenly-demon/ and composites every
// public/assets output the data wiring (src/data/anime/towns.ts) consumes:
//
//   - 14 unit card faces (743x1040) — obsidian/crimson board-game hierarchy
//     (title · left stat rail · art window · Few dual-cost / # PACK · rules),
//     the fuyuki self-contained card layout re-themed demonic.
//   - 5 hero portraits (1086x1448 WebP) — master over a demonic vignette + frame.
//   - the Demon Ancestor commander card (1060x1484).
//   - the town panorama pair (1672x941, empty + full) sliced into 7 board bars.
//   - the D-S1 starting tile (1024x985, masked into the A-S1 hex-flower alpha).
//   - the town icon (174x137, cropped from the full panorama).
//
// Every output's pixel dimensions are read LIVE from its existing twin with
// sharp.metadata() and re-asserted after write. Deterministic + idempotent.
//
// STAT/COST/RULE data below is kept in LOCKSTEP with src/data/anime/towns.ts —
// re-verify on any stat change (CLAUDE.md §2).
//
// Run: node scripts/build-heavenly-demon-art.mjs

import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(root, "public", "assets");
const raw = path.join(root, "scripts", "anime-art", "raw", "heavenly-demon");
// Outputs are written to a STAGING dir (fresh files, no lock contention), then a
// separate `cp` deploy step moves them into public/assets — this worktree has an
// external scanner that intermittently locks existing public/assets targets for
// several seconds (node writeFile/rename → errno -4094/-4048), while a fresh
// staged write + shell cp is reliable. Deploy: bash scripts/deploy-heavenly-demon-art.sh
const STAGE = path.join(raw, "_staged");

const CARD_W = 743;
const CARD_H = 1040;

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------
const f1 = (n) => Number(n).toFixed(1);
const f2 = (n) => Number(n).toFixed(2);
const xml = (v) =>
  String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const TABLE = [];
async function mirrorMeta(rel) {
  const m = await sharp(path.join(assets, rel)).metadata();
  if (!m.width || !m.height) throw new Error(`No dimensions for mirror: ${rel}`);
  return { width: m.width, height: m.height };
}
function rawPath(rel) {
  const p = path.join(raw, rel);
  if (!existsSync(p) || statSync(p).size === 0) throw new Error(`Missing master: ${path.relative(root, p)}`);
  return p;
}
async function dataUri(rel, { flop = false } = {}) {
  let buf = await readFile(rawPath(rel));
  if (flop) buf = await sharp(buf).flop().png().toBuffer();
  return `data:image/png;base64,${buf.toString("base64")}`;
}
async function verifyOut(outRel, expect, minKb = 0) {
  const outPath = path.join(STAGE, outRel);
  const m = await sharp(outPath).metadata();
  if (m.width !== expect.width || m.height !== expect.height) {
    throw new Error(`Dim mismatch ${outRel}: got ${m.width}x${m.height}, want ${expect.width}x${expect.height}`);
  }
  const bytes = statSync(outPath).size;
  if (minKb && bytes < minKb * 1024) throw new Error(`${outRel} ${(bytes / 1024).toFixed(1)}KB < ${minKb}KB min`);
  TABLE.push({ path: outRel, dims: `${m.width}x${m.height}`, kb: (bytes / 1024).toFixed(1) });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Encode to a buffer then fs-write with a small retry: sharp's direct toFile —
// and even an fs open — intermittently hits a transient Windows sharing lock
// (errno -4094 / EINVAL) on this worktree; buffer-write + retry is robust.
async function robustWrite(outPath, buf) {
  await mkdir(path.dirname(outPath), { recursive: true });
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await writeFile(outPath, buf);
      return;
    } catch (e) {
      if (attempt === 5) throw e;
      await sleep(300 * (attempt + 1));
    }
  }
}
async function writeWebp(pipeline, outRel, expect, opts = {}) {
  const buf = await pipeline.webp({ quality: opts.quality ?? 90, effort: 6 }).toBuffer();
  await robustWrite(path.join(STAGE, outRel), buf);
  await verifyOut(outRel, expect, opts.minKb ?? 0);
}
async function svgToBuf(svg, W, H) {
  return sharp(Buffer.from(svg)).resize(W, H, { fit: "fill" }).png().toBuffer();
}
function wrap(value, max, limit) {
  const words = String(value).split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const cand = line ? `${line} ${word}` : word;
    if (cand.length > max && line) {
      lines.push(line);
      line = word;
    } else line = cand;
  }
  if (line) lines.push(line);
  return lines.slice(0, limit);
}

// ---------------------------------------------------------------------------
// demonic theme
// ---------------------------------------------------------------------------
const TIER = {
  bronze: { label: "BRONZE", light: "#d08a4c", mid: "#8a3f1e", dark: "#2e1109" },
  silver: { label: "SILVER", light: "#d9dde6", mid: "#7d8593", dark: "#2b3038" },
  golden: { label: "GOLD", light: "#e7b73c", mid: "#9c6a1f", dark: "#3a2408" }
};
const JADE = "#6fd0a0"; // FEW accent (ghost-jade)
const CRIMSON = "#e05468"; // PACK accent (blood)

function statIcon(kind, x, y) {
  const c = `fill="none" stroke="#f2dcd0" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" filter="url(#ish)"`;
  if (kind === "attack")
    return `<g transform="translate(${x} ${y})" ${c}><path d="M-22-19 20 23M-14-25l-9 9 9 2M14 25l9-9-9-2"/><path d="M22-19-20 23M14-25l9 9-9 2M-14 25l-9-9 9-2"/></g>`;
  if (kind === "defense")
    return `<path d="M0-27 24-19V0c0 19-10 31-24 38C-14 31-24 19-24 0v-19z" transform="translate(${x} ${y})" ${c}/>`;
  if (kind === "health")
    return `<path d="M${x - 25} ${y - 10}c0-20 27-27 34-8 8-19 35-12 35 8 0 19-22 34-35 45-13-11-34-26-34-45z" ${c}/>`;
  return `<g transform="translate(${x} ${y})" ${c}><path d="M-23 20 4-28l-3 30 22-4-31 31 5-24z"/><path d="M-27 31h49"/></g>`;
}
function typeGlyph(kind, x, y) {
  const c = `fill="none" stroke="#f0d8cc" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" filter="url(#ish)"`;
  if (kind === "RANGED")
    return `<g transform="translate(${x} ${y})" ${c}><path d="M-11-19C10-10 10 10-11 19M-11-19v38M-19 0h37M11-5l8 5-8 5"/></g>`;
  if (kind === "FLYING")
    return `<g transform="translate(${x} ${y})" ${c}><path d="M-19 10C-6-16 11-19 22-14 12-7 9-1 11 6 4 1-3 4-8 12 0 8 6 10 12 16 0 13-10 13-19 10Z"/></g>`;
  return `<g transform="translate(${x} ${y})" ${c}><path d="M-12-18h14v18c7 7 14 9 23 9v12h-42v-10c7-3 8-8 4-16z"/></g>`;
}
function coinRow(x, y, gold, valuables, label) {
  const parts = [];
  parts.push(
    `<text x="${f1(x)}" y="${f1(y)}" font-family="'Liberation Serif',Georgia,serif" font-weight="700" font-size="20" fill="#f3d9c4" filter="url(#tsh)">${xml(
      label
    )}</text>`
  );
  let cx = x + 62;
  parts.push(`<circle cx="${f1(cx)}" cy="${f1(y - 6)}" r="9" fill="#e7b73c" stroke="#3a2408" stroke-width="2"/>`);
  parts.push(
    `<text x="${f1(cx + 15)}" y="${f1(y)}" font-family="'Liberation Serif',Georgia,serif" font-weight="700" font-size="21" fill="#fff0cf" filter="url(#tsh)">${gold}</text>`
  );
  if (valuables) {
    cx += 58;
    parts.push(
      `<path d="M${f1(cx)} ${f1(y - 15)}l7 9-7 9-7-9z" fill="#8fd8ff" stroke="#1b3a52" stroke-width="2"/>`
    );
    parts.push(
      `<text x="${f1(cx + 12)}" y="${f1(y)}" font-family="'Liberation Serif',Georgia,serif" font-weight="700" font-size="21" fill="#e6f6ff" filter="url(#tsh)">${valuables}</text>`
    );
  }
  return parts.join("");
}

function unitCardSvg(card, side, artHref) {
  const P = TIER[card.tier];
  const s = card[side];
  const accent = side === "pack" ? CRIMSON : JADE;
  const rules = wrap(s.rule, side === "pack" ? 44 : 46, 6);
  const lineH = rules.length >= 5 ? 19 : rules.length === 4 ? 22 : 25;
  const rFont = rules.length >= 5 ? 17.5 : rules.length === 4 ? 19 : rules.length === 3 ? 20.5 : 22.5;
  const textTop = 936 - ((rules.length - 1) * lineH) / 2;
  const ruleText = rules
    .map((l, i) => `<tspan x="420" y="${f1(textTop + i * lineH)}">${xml(l)}</tspan>`)
    .join("");
  const stats = [
    ["attack", s.attack],
    ["defense", s.defense],
    ["health", s.health],
    ["initiative", s.initiative]
  ];
  const statRows = stats
    .map(([k, v], i) => {
      const y = 214 + i * 148;
      return `<g>${statIcon(k, 98, y - 25)}<text x="98" y="${y + 45}" class="sn">${v}</text></g>`;
    })
    .join("");

  const titleSize = card.name.length > 18 ? 30 : card.name.length > 14 ? 35 : 42;
  const costBand = card.summoned
    ? `<text x="371" y="868" class="disp" fill="#f6dcc2" font-size="28" text-anchor="middle" filter="url(#tsh)">SUMMONED · ROUND 1</text>`
    : side === "few"
      ? coinRow(150, 863, card.few.cost.gold, card.few.cost.valuables ?? 0, "FEW") +
        coinRow(430, 863, card.pack.cost.gold, card.pack.cost.valuables ?? 0, "PACK")
      : `<text x="371" y="868" class="disp" fill="#f6dcc2" font-size="34" text-anchor="middle" filter="url(#tsh)"># PACK</text>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  <defs>
    <linearGradient id="outer" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0c0708"/><stop offset=".5" stop-color="#2a0d14"/><stop offset="1" stop-color="#070506"/></linearGradient>
    <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${P.light}"/><stop offset=".35" stop-color="${P.mid}"/><stop offset=".68" stop-color="${P.dark}"/><stop offset="1" stop-color="${P.light}"/></linearGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#33131f"/><stop offset="1" stop-color="#120a0f"/></linearGradient>
    <linearGradient id="rail" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#1c0d13"/><stop offset=".5" stop-color="#45202c"/><stop offset="1" stop-color="#160a10"/></linearGradient>
    <radialGradient id="seal"><stop stop-color="#ff9a86" stop-opacity=".2"/><stop offset="1" stop-color="#7a1420" stop-opacity="0"/></radialGradient>
    <radialGradient id="packglow" cx="0.5" cy="0.42" r="0.7"><stop stop-color="#e0546833" /><stop offset="1" stop-color="#e0546800"/></radialGradient>
    <filter id="tsh" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur in="SourceAlpha" stdDeviation="2"/><feOffset dy="2"/><feComponentTransfer><feFuncA type="linear" slope=".8"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="ish" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur in="SourceAlpha" stdDeviation="1.6"/><feOffset dx="1.2" dy="2"/><feComponentTransfer><feFuncA type="linear" slope=".85"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <clipPath id="artClip"><rect x="169" y="146" width="526" height="668" rx="8"/></clipPath>
    <style>
      .disp { font-family:"Liberation Serif",Georgia,serif; font-weight:700; letter-spacing:1px; }
      .sc { font-family:"Liberation Serif",Georgia,serif; font-weight:700; letter-spacing:3px; }
      .sn { fill:#fff0d5; font-family:"Liberation Serif",Georgia,serif; font-size:43px; font-weight:700; text-anchor:middle; filter:url(#tsh); }
    </style>
  </defs>

  <rect width="743" height="1040" rx="28" fill="#060405"/>
  <rect x="20" y="18" width="703" height="1004" rx="22" fill="url(#outer)"/>

  <g clip-path="url(#artClip)">
    <rect x="169" y="146" width="526" height="668" fill="#0b0709"/>
    <image x="169" y="146" width="526" height="668" preserveAspectRatio="xMidYMid slice" href="${xml(artHref)}" xlink:href="${xml(artHref)}"/>
    <rect x="169" y="146" width="526" height="668" fill="url(#seal)" opacity=".3"/>
    ${side === "pack" ? '<rect x="169" y="146" width="526" height="668" fill="url(#packglow)"/>' : ""}
  </g>

  <g>
    <rect x="32" y="30" width="679" height="968" rx="16" fill="none" stroke="#080506" stroke-width="22"/>
    <rect x="33" y="31" width="677" height="966" rx="15" fill="none" stroke="url(#metal)" stroke-width="8"/>
    <rect x="43" y="41" width="657" height="946" rx="11" fill="none" stroke="${accent}" stroke-opacity=".4" stroke-width="2"/>

    <rect x="49" y="50" width="645" height="78" rx="8" fill="url(#panel)" stroke="url(#metal)" stroke-width="5"/>
    <circle cx="651" cy="89" r="26" fill="none" stroke="${accent}" stroke-opacity=".45" stroke-width="2"/>
    <circle cx="651" cy="89" r="14" fill="none" stroke="${accent}" stroke-opacity=".8"/>
    <path d="m651 61 7 18 19 2-15 12 5 19-16-10-16 10 5-19-15-12 19-2z" fill="none" stroke="${accent}" stroke-width="1.5" opacity=".8"/>

    <rect x="49" y="143" width="108" height="674" rx="8" fill="url(#rail)" stroke="url(#metal)" stroke-width="5"/>
    <rect x="166" y="143" width="532" height="674" rx="9" fill="none" stroke="url(#metal)" stroke-width="6"/>
    ${[288, 436, 584].map((y) => `<path d="M53 ${y}h100" stroke="${accent}" stroke-opacity=".4" stroke-width="2"/>`).join("")}
    ${statRows}

    <rect x="49" y="833" width="649" height="52" rx="7" fill="url(#rail)" stroke="url(#metal)" stroke-width="4"/>

    <rect x="49" y="895" width="649" height="82" rx="8" fill="url(#panel)" stroke="url(#metal)" stroke-width="4"/>
    <path d="M40 86q34-48 80-47M703 86q-34-48-80-47M40 944q34 48 80 47M703 944q-34 48-80 47" fill="none" stroke="${P.light}" stroke-width="3" opacity=".8"/>
  </g>

  <g>
    <text x="363" y="102" class="disp" fill="#ffe6c2" font-size="${titleSize}" text-anchor="middle" filter="url(#tsh)">${xml(
      card.name
    )}</text>
    <g>${typeGlyph(card.kind, 200, 176)}<text x="228" y="182" class="sc" fill="#f6e0cf" font-size="15" filter="url(#tsh)">${card.kind}</text></g>
    ${card.summoned
      ? `<text x="655" y="791" class="sc" fill="${P.light}" font-size="13" text-anchor="end">TOKEN</text>`
      : `<g transform="translate(655 786)"><path d="m0-15 4 10 11 1-8 6 3 11-10-6-10 6 3-11-8-6 11-1z" fill="${P.light}" stroke="${P.dark}" stroke-width="2"/></g>
    <text x="622" y="791" class="sc" fill="${P.light}" font-size="13" text-anchor="end">LV ${card.level}</text>`}
    ${costBand}
    <text class="disp" fill="#f8e6cf" font-size="${rFont}" text-anchor="middle" filter="url(#tsh)">${ruleText}</text>
  </g>
</svg>`;
}

// ---------------------------------------------------------------------------
// units
// ---------------------------------------------------------------------------
const CARDS = [
  {
    slug: "blood-disciples", tier: "bronze", name: "Blood Disciples", kind: "GROUND", level: 1,
    fewMaster: "units/blood-disciples-master.png", packMaster: "units/blood-disciples-pack-master.png", packFlip: false,
    few: { attack: 2, defense: 0, health: 3, initiative: 6, cost: { gold: 2 }, rule: "No printed ability." },
    pack: { attack: 3, defense: 0, health: 3, initiative: 7, cost: { gold: 4 }, rule: "Blood Siphon — after its own attack deals damage, heal 1. Never on Retaliation." }
  },
  {
    slug: "gu-witches", tier: "bronze", name: "Gu Witches", kind: "RANGED", level: 2,
    fewMaster: "units/gu-witches-master.png", packMaster: "units/gu-witches-pack-master.png", packFlip: false,
    few: { attack: 2, defense: 1, health: 2, initiative: 5, cost: { gold: 4 }, rule: "Hex Darts — ignores the Combat penalty for attacking an adjacent unit (the long-range / behind-wall penalty still applies)." },
    pack: { attack: 3, defense: 1, health: 2, initiative: 6, cost: { gold: 6 }, rule: "Hex Darts — ignores the adjacent-unit penalty; Gu Curse — after attacking, roll a die; on 0 the target is Paralyzed." }
  },
  {
    slug: "shadow-wraiths", tier: "bronze", name: "Shadow Sabre Disciples", kind: "GROUND", level: 3,
    fewMaster: "units/shadow-wraiths-master.png", packMaster: "units/shadow-wraiths-pack-master.png", packFlip: false,
    few: { attack: 2, defense: 0, health: 2, initiative: 9, cost: { gold: 4 }, rule: "No printed ability." },
    pack: { attack: 3, defense: 0, health: 3, initiative: 10, cost: { gold: 6 }, rule: "Umbral Step — attacks do not provoke a Retaliation Attack." }
  },
  {
    slug: "corpse-puppets", tier: "silver", name: "Corpse Puppets", kind: "GROUND", level: 4,
    fewMaster: "units/corpse-puppets-master.png", packMaster: "units/corpse-puppets-pack-master.png", packFlip: false,
    few: { attack: 2, defense: 2, health: 5, initiative: 2, cost: { gold: 9 }, rule: "Grave Ward — always rolls the Defend die when attacked." },
    pack: { attack: 3, defense: 2, health: 6, initiative: 3, cost: { gold: 13 }, rule: "Grave Ward — always rolls the Defend die; Corpse Burst — on defeat, deal 1 damage to every adjacent unit." }
  },
  {
    slug: "bone-reavers", tier: "silver", name: "Bone Reavers", kind: "GROUND", level: 5,
    fewMaster: "units/bone-reavers-master.png", packMaster: "units/bone-reavers-pack-master.png", packFlip: false,
    few: { attack: 4, defense: 1, health: 4, initiative: 7, cost: { gold: 9 }, rule: "Reaping Charge — +1 Attack on its attack after this unit moves." },
    pack: { attack: 5, defense: 1, health: 5, initiative: 8, cost: { gold: 14 }, rule: "Reaping Charge — +1 Attack after moving; Ghost Blades — ignores Retaliation." }
  },
  {
    slug: "ghost-king", tier: "golden", name: "Ghost King", kind: "RANGED", level: 6,
    fewMaster: "units/ghost-king-few-master.png", packMaster: "units/ghost-king-pack-master.png", packFlip: false,
    few: { attack: 4, defense: 3, health: 7, initiative: 5, cost: { gold: 14, valuables: 1 }, rule: "Soulfire — ignores adjacent ranged penalty; heal 1 on activation." },
    pack: { attack: 5, defense: 3, health: 8, initiative: 6, cost: { gold: 22, valuables: 2 }, rule: "Royal Soulfire — ignores all Combat penalties; heal 2 on activation." }
  },
  {
    slug: "demon-avatar", tier: "golden", name: "Heavenly Demon Avatar", kind: "GROUND", level: 7,
    fewMaster: "units/demon-avatar-few-master.png", packMaster: "units/demon-avatar-pack-master.png", packFlip: false,
    few: { attack: 6, defense: 2, health: 7, initiative: 6, cost: { gold: 16, valuables: 1 }, rule: "Reap the Fallen — adjacent removals grant +1 Attack, maximum +2 this Combat." },
    pack: { attack: 7, defense: 2, health: 8, initiative: 7, cost: { gold: 24, valuables: 2 }, rule: "Reap the Fallen — gain up to +2 Attack from adjacent removals; ignore ongoing effects." }
  }
];

async function buildUnits() {
  for (const card of CARDS) {
    for (const side of ["few", "pack"]) {
      const masterRel = side === "few" ? card.fewMaster : card.packMaster;
      const flop = side === "pack" && card.packFlip;
      const href = await dataUri(masterRel, { flop });
      const svg = unitCardSvg(card, side, href);
      const outRel = `anime/units/heavenly-demon/units-heavenly-demon-${card.tier}-${card.slug}-${side}.webp`;
      await writeWebp(
        sharp(await svgToBuf(svg, CARD_W, CARD_H)),
        outRel,
        { width: CARD_W, height: CARD_H },
        { minKb: 20, quality: 90 }
      );
    }
  }
  const boundSoul = {
    slug: "bound-soul", tier: "bronze", name: "Bound Soul", kind: "FLYING", level: 0,
    summoned: true,
    few: { attack: 2, defense: 0, health: 2, initiative: 8, cost: { gold: 0 }, rule: "Soul Banner — expires after round 1. Ignores Retaliation." },
    pack: { attack: 2, defense: 0, health: 2, initiative: 8, cost: { gold: 0 }, rule: "Soul Banner — expires after round 1. Ignores Retaliation." }
  };
  const boundSoulArt = await dataUri("units/bound-soul-master.png");
  await writeWebp(
    sharp(await svgToBuf(unitCardSvg(boundSoul, "few", boundSoulArt), CARD_W, CARD_H)),
    "anime/units/soul-banner-shade-card.webp",
    { width: CARD_W, height: CARD_H },
    { minKb: 20, quality: 90 }
  );
}

// ---------------------------------------------------------------------------
// hero portraits (master full-bleed over a demonic vignette + thin frame)
// ---------------------------------------------------------------------------
const HEROES = ["xuedao", "guiyan", "xuanming", "yaoji", "molian"];

function heroFrameSvg(W, H) {
  const short = Math.min(W, H);
  const m = short * 0.02;
  const gw = short * 0.009;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="vig" cx="0.5" cy="0.44" r="0.75"><stop offset="0.55" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#0a0406" stop-opacity="0.6"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#vig)"/>
  <rect x="${f1(m)}" y="${f1(m)}" width="${f1(W - 2 * m)}" height="${f1(H - 2 * m)}" rx="${f1(short * 0.02)}" fill="none" stroke="#c33a48" stroke-width="${f2(gw)}"/>
  <rect x="${f1(m + gw * 1.4)}" y="${f1(m + gw * 1.4)}" width="${f1(W - 2 * (m + gw * 1.4))}" height="${f1(H - 2 * (m + gw * 1.4))}" rx="${f1(short * 0.016)}" fill="none" stroke="#e7b73c" stroke-width="${f2(gw * 0.5)}" opacity="0.75"/>
</svg>`;
}

async function buildHeroes() {
  const W = 1086;
  const H = 1448;
  for (const id of HEROES) {
    const charBuf = await sharp(rawPath(`heroes/${id}-master.png`))
      .resize(W, H, { fit: "cover", position: "top" })
      .png()
      .toBuffer();
    const bg = await svgToBuf(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a0d14"/><stop offset="0.55" stop-color="#170a10"/><stop offset="1" stop-color="#070405"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/></svg>`,
      W,
      H
    );
    const frame = await svgToBuf(heroFrameSvg(W, H), W, H);
    await writeWebp(
      sharp(bg).composite([{ input: charBuf, left: 0, top: 0 }, { input: frame, left: 0, top: 0 }]),
      `anime/heroes/${id}.webp`,
      { width: W, height: H },
      { minKb: 60 }
    );
  }
}

// ---------------------------------------------------------------------------
// commander card (Demon Ancestor)
// ---------------------------------------------------------------------------
function commanderFrameSvg(W, H) {
  const short = Math.min(W, H);
  const m = short * 0.02;
  const gw = short * 0.012;
  const bandX = W * 0.07;
  const bandY = H * 0.035;
  const bandW = W * 0.86;
  const bandH = H * 0.12;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="cband" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#e7b73c"/><stop offset="1" stop-color="#8b1a2b"/></linearGradient>
    <radialGradient id="cvig" cx="0.5" cy="0.45" r="0.75"><stop offset="0.5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#0a0406" stop-opacity="0.62"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#cvig)"/>
  <rect x="${f1(m)}" y="${f1(m)}" width="${f1(W - 2 * m)}" height="${f1(H - 2 * m)}" rx="${f1(short * 0.03)}" fill="none" stroke="#e7b73c" stroke-width="${f2(gw)}"/>
  <rect x="${f1(m + gw)}" y="${f1(m + gw)}" width="${f1(W - 2 * (m + gw))}" height="${f1(H - 2 * (m + gw))}" rx="${f1(short * 0.026)}" fill="none" stroke="#c33a48" stroke-width="${f2(short * 0.006)}" opacity="0.9"/>
  <rect x="${f1(bandX)}" y="${f1(bandY)}" width="${f1(bandW)}" height="${f1(bandH)}" rx="${f1(bandH * 0.16)}" fill="url(#cband)" stroke="#2a0d10" stroke-width="${f2(short * 0.004)}"/>
  <text x="${f1(W / 2)}" y="${f1(bandY + bandH * 0.44)}" font-family="'Liberation Serif',Georgia,serif" font-weight="700" font-size="${f1(bandH * 0.42)}" fill="#1a0a0d" text-anchor="middle" style="letter-spacing:2px">DEMON ANCESTOR</text>
  <text x="${f1(W / 2)}" y="${f1(bandY + bandH * 0.82)}" font-family="'Liberation Serif',Georgia,serif" font-weight="700" font-size="${f1(bandH * 0.2)}" fill="#3a1109" text-anchor="middle" style="letter-spacing:3px">HEAVENLY DEMON — COMMANDER</text>
</svg>`;
}

async function buildCommander() {
  // Fixed commander-card dims (matches the azur_lane/sword_saint commander cards).
  const W = 1060;
  const H = 1484;
  const charBuf = await sharp(rawPath("commander/demon-ancestor-master.png"))
    .resize(W, H, { fit: "cover", position: "top" })
    .png()
    .toBuffer();
  const bg = await svgToBuf(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a0d14"/><stop offset="0.55" stop-color="#150a10"/><stop offset="1" stop-color="#060405"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/></svg>`,
    W,
    H
  );
  const frame = await svgToBuf(commanderFrameSvg(W, H), W, H);
  await writeWebp(
    sharp(bg).composite([{ input: charBuf, left: 0, top: 0 }, { input: frame, left: 0, top: 0 }]),
    "units-commander-demon_ancestor.webp",
    { width: W, height: H },
    { minKb: 40 }
  );
}

// ---------------------------------------------------------------------------
// panorama (empty + full) + bars + tile + icon
// ---------------------------------------------------------------------------
async function panoramaBuf(masterRel, W, H) {
  return sharp(rawPath(masterRel)).resize(W, H, { fit: "cover", position: "centre" }).png().toBuffer();
}

// Fixed panorama / bar / icon dims (match the azure_breeze twins the placeholders
// mirrored). Bar 1 is 238 wide, bars 2-7 are 239 — they tile to 1672.
const PANO_W = 1672;
const PANO_H = 941;
const BAR_W = [238, 239, 239, 239, 239, 239, 239];
const ICON_W = 174;
const ICON_H = 137;

async function buildPanoramasAndBars() {
  const W = PANO_W;
  const H = PANO_H;
  const emptyBuf = await panoramaBuf("panorama/palace-empty-master.png", W, H);
  const fullBuf = await panoramaBuf("panorama/palace-full-master.png", W, H);
  await writeWebp(sharp(emptyBuf), "anime/towns/heavenly-demon-palace-empty.webp", { width: W, height: H }, { minKb: 30, quality: 92 });
  await writeWebp(sharp(fullBuf), "anime/towns/heavenly-demon-palace-full.webp", { width: W, height: H }, { minKb: 30, quality: 92 });

  // 7 contiguous bars sliced from the FULL panorama.
  let x = 0;
  for (let n = 1; n <= 7; n++) {
    const bw = BAR_W[n - 1];
    await writeWebp(
      sharp(fullBuf).extract({ left: x, top: 0, width: bw, height: H }),
      `town-board/heavenly-demon-bar-${n}.webp`,
      { width: bw, height: H },
      { minKb: 3 }
    );
    x += bw;
  }

  // town icon — crop a central palace region of the FULL panorama, downscale.
  const iw = ICON_W;
  const ih = ICON_H;
  const cropW = Math.round(H * (iw / ih));
  const cropLeft = Math.round(W * 0.5 - cropW / 2);
  await writeWebp(
    sharp(fullBuf).extract({ left: Math.max(0, cropLeft), top: 0, width: Math.min(cropW, W), height: H }).resize(iw, ih, { fit: "fill" }),
    "town-icon-heavenly_demon.webp",
    { width: iw, height: ih },
    { minKb: 1 }
  );
}

async function buildTile() {
  const W = 1024;
  const H = 985;
  // Use the committed A-S1 tile's flower-shaped alpha as the exact hex mask
  // (tile-art-transparency invariant): composite dest-in keeps the scene only
  // where A-S1 is opaque, so D-S1's corners stay transparent on the board.
  const maskRGBA = await sharp(path.join(assets, "anime/tiles/a-s1.webp"))
    .resize(W, H, { fit: "fill" })
    .ensureAlpha()
    .toBuffer();
  const sceneBuf = await sharp(rawPath("tile/palace-tile-master.png"))
    .resize(W, H, { fit: "cover", position: "centre" })
    .ensureAlpha()
    .toBuffer();
  await writeWebp(
    sharp(sceneBuf).composite([{ input: maskRGBA, blend: "dest-in" }]),
    "anime/tiles/d-s1.webp",
    { width: W, height: H },
    { minKb: 20 }
  );
}

async function main() {
  const only = process.argv[2];
  if (!only || only === "units") await buildUnits();
  if (!only || only === "heroes") await buildHeroes();
  if (!only || only === "commander") await buildCommander();
  if (!only || only === "panorama") await buildPanoramasAndBars();
  if (!only || only === "tile") await buildTile();

  console.log("\nHeavenly Demon art built:");
  for (const r of TABLE) console.log(`  ${r.dims}\t${r.kb}KB\t${r.path}`);
  console.log(`\n${TABLE.length} files.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

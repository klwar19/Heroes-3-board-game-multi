#!/usr/bin/env node

/**
 * Doom neutral unit cards.
 *
 * The art plates are kept in generated-session-art so this compositor remains
 * reproducible without inventing a second source-art tree. The hierarchy stays
 * close to the board-game cards: tier badge, stat rail, art window, type
 * marker, neutral-cost band, and a rules panel.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ART_DIR = path.join(ROOT, "generated-session-art");
const EDITABLE = path.join(ROOT, "scripts", "doom-art", "editable");
const PUBLIC = path.join(ROOT, "public", "assets", "doom", "units");
const SESSION = path.join(ROOT, "generated-session-art", "doom-cards");

const CARD_W = 743;
const CARD_H = 1040;
const ART = { x: 173, y: 158, w: 522, h: 594 };
const WEBP = { quality: 84, effort: 6 };

const TIER = {
  bronze: { light: "#e9b26e", mid: "#a85c2e", dark: "#421b16", label: "BRONZE" },
  silver: { light: "#e7edf1", mid: "#8794a0", dark: "#28313b", label: "SILVER" },
  gold: { light: "#ffe49c", mid: "#c78b27", dark: "#553615", label: "GOLD" },
  azure: { light: "#a8d8ff", mid: "#3977a5", dark: "#132b48", label: "AZURE" }
};

const CARDS = [
  {
    slug: "demon",
    art: "05-doom-demon-unit-card-art-v2.png",
    artPosition: "top",
    artScale: 1.04,
    name: "Demon",
    tier: "bronze",
    kind: "MELEE",
    stats: [2, 1, 4, 7],
    cost: "7",
    rules: "Relentless Bite - unlimited Retaliation Attacks; +1 Attack when retaliating."
  },
  {
    slug: "former-human",
    art: "06-doom-former-human-unit-card-art-v2.png",
    artPosition: "top",
    artScale: 1.05,
    name: "Former Human",
    tier: "bronze",
    kind: "RANGED",
    stats: [2, 0, 3, 4],
    cost: "4",
    rules: "Possessed Rifle - standard ranged attack."
  },
  {
    slug: "imp",
    art: "09-doom-imp-unit-card-art.png",
    artPosition: "top",
    artScale: 1.04,
    name: "Imp",
    tier: "bronze",
    kind: "RANGED",
    stats: [2, 0, 4, 7],
    cost: "5",
    rules: "Fireball - an attack roll of 0 or lower deals 1 extra damage; ignore the melee penalty when attacking an adjacent unit."
  },
  {
    slug: "lost-soul",
    art: "11-doom-lost-soul-unit-card-art.png",
    artPosition: "centre",
    artScale: 1.08,
    name: "Lost Soul",
    tier: "bronze",
    kind: "FLYING",
    stats: [2, 0, 3, 10],
    cost: "5",
    rules: "Charging Skull - attacks by this unit never provoke a Retaliation Attack."
  },
  {
    slug: "former-human-sergeant",
    art: "07-doom-former-human-sergeant-unit-card-art-v2.png",
    artPosition: "top",
    artScale: 1.04,
    name: "Former Human Sergeant",
    tier: "bronze",
    kind: "MELEE",
    stats: [2, 1, 3, 5],
    cost: "6",
    rules: "Shotgun Assault - roll 2 Attack dice and resolve both results, also when retaliating."
  },
  {
    slug: "cacodemon",
    art: "10-doom-cacodemon-unit-card-art-v3.png",
    artPosition: "centre",
    artScale: 1.05,
    name: "Cacodemon",
    tier: "silver",
    kind: "MELEE",
    stats: [3, 1, 5, 9],
    cost: "11",
    rules: "Burning Poison - on an Attack roll of -1 or 0, place a poison cube; it deals 1 damage at activation."
  },
  {
    slug: "hell-knight",
    art: "12-doom-hell-knight-unit-card-art-v2.png",
    artPosition: "top",
    artScale: 1.04,
    name: "Hell Knight",
    tier: "silver",
    kind: "MELEE",
    stats: [3, 2, 6, 6],
    cost: "14",
    rules: "Demonic Flesh - reduce any damage from spells by 1."
  },
  {
    slug: "arachnotron",
    art: "14-doom-arachnotron-unit-card-art-v2.png",
    artPosition: "centre",
    artScale: 1.04,
    name: "Arachnotron",
    tier: "silver",
    kind: "RANGED",
    stats: [3, 0, 6, 7],
    cost: "15",
    rules: "Triple Plasma - attack the target 3 times: Attack 3, then Attack 2, then Attack 1."
  },
  {
    slug: "baron-of-hell",
    art: "13-doom-baron-of-hell-unit-card-art-v3.png",
    artPosition: "top",
    artScale: 1.04,
    name: "Baron of Hell",
    tier: "gold",
    kind: "MELEE",
    stats: [5, 2, 8, 7],
    cost: "29",
    rules: "Hellborn Hide - cannot take more than 4 damage from a single attack."
  },
  {
    slug: "former-commando",
    art: "08-doom-former-commando-unit-card-art-v2.png",
    artPosition: "top",
    artScale: 1.07,
    name: "Former Commando",
    tier: "silver",
    kind: "RANGED",
    stats: [3, 1, 4, 6],
    cost: "13",
    rules: "Suppressing Fire - if the target is non-adjacent, attack that target again."
  },
  {
    slug: "revenant",
    art: "16-doom-revenant-unit-card-art.png",
    artPosition: "top",
    artScale: 1.04,
    name: "Revenant",
    tier: "gold",
    kind: "MELEE",
    stats: [5, 1, 7, 10],
    cost: "20",
    rules: "Death Mark - at activation, deal 1 damage to the target this unit will attack."
  },
  {
    slug: "mancubus",
    art: "17-doom-mancubus-unit-card-art.png",
    artPosition: "top",
    artScale: 1.04,
    name: "Mancubus",
    tier: "gold",
    kind: "RANGED",
    stats: [5, 1, 7, 7],
    cost: "22",
    rules: "Flame Volley - non-adjacent splash; when retaliating, roll 2 Attack dice and resolve the higher."
  },
  {
    slug: "pain-elemental",
    art: "15-doom-pain-elemental-unit-card-art-v2.png",
    artPosition: "centre",
    artScale: 1.04,
    name: "Pain Elemental",
    tier: "gold",
    kind: "FLYING",
    stats: [4, 1, 6, 7],
    cost: "20",
    rules: "Lost Soul Burst - after an attack, randomly summon a Lost Soul on an empty space."
  },
  {
    slug: "arch-vile",
    art: "18-doom-arch-vile-unit-card-art.png",
    artPosition: "top",
    artScale: 1.04,
    name: "Arch-Vile",
    tier: "azure",
    kind: "RANGED",
    stats: [6, 1, 8, 12],
    cost: "30",
    rules: "Doom Guard - once in Combat, automatically block the first lethal attack against a friendly unit."
  },
  {
    slug: "spider-mastermind",
    art: "19-doom-spider-mastermind-unit-card-art-v2.png",
    artPosition: "centre",
    artScale: 1.02,
    name: "Spider Mastermind",
    tier: "azure",
    kind: "MELEE",
    stats: [7, 2, 10, 11],
    cost: "38 + 2 valuables",
    rules: "Mastermind Assault - on -1, also attack a unit adjacent to the target; immune to Specialty damage."
  },
  {
    slug: "cyberdemon",
    art: "20-doom-cyberdemon-unit-card-art-v2.png",
    artPosition: "top",
    artScale: 1.03,
    name: "Cyberdemon",
    tier: "azure",
    kind: "RANGED",
    stats: [7, 3, 10, 10],
    cost: "42 + 2 valuables",
    rules: "Rocket Barrage - a non-adjacent attack also deals 1 damage adjacent to the target; reduce spell damage by 3."
  }
];

const xml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

function wrap(value, max = 51, limit = 6) {
  const lines = [];
  let line = "";
  for (const word of String(value).split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && candidate.length > max) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, limit);
}

function statIcon(kind, cx, cy) {
  const common = `fill="none" stroke="#f3e5c1" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"`;
  if (kind === "attack") return `<g ${common}><path d="M${cx - 16} ${cy + 14}L${cx + 15} ${cy - 17}"/><path d="M${cx + 15} ${cy - 17}l-2 10M${cx + 15} ${cy - 17}l-10 2"/><path d="M${cx - 11} ${cy + 9}l8 8"/><path d="M${cx + 16} ${cy + 14}L${cx - 15} ${cy - 17}"/><path d="M${cx - 15} ${cy - 17}l10 2M${cx - 15} ${cy - 17}l2 10"/><path d="M${cx + 11} ${cy + 9}l-8 8"/></g>`;
  if (kind === "defense") return `<path d="M${cx} ${cy - 19}l16 7v12c0 11-7 18-16 22-9-4-16-11-16-22v-12z" ${common}/>`;
  if (kind === "health") return `<path d="M${cx} ${cy + 18}S${cx - 22} ${cy + 5} ${cx - 22} ${cy - 8}c0-8 11-13 22-3 11-10 22-5 22 3 0 13-22 26-22 26z" fill="#b63f39" fill-opacity=".85" stroke="#f3e5c1" stroke-width="2.5"/>`;
  return `<path d="M${cx + 4} ${cy - 20}L${cx - 12} ${cy + 2}h12l-5 20 17-27H${cx}z" fill="#f4bd52" stroke="#f3e5c1" stroke-width="2.5" stroke-linejoin="round"/>`;
}

function typeIcon(cx, cy) {
  return `<g transform="translate(${cx} ${cy})" fill="none" stroke="#f4dfad" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle r="15" stroke-opacity=".25"/><path d="M-12 7L10-10M-3-12h13v13M-13-2v10h10"/><circle r="4" fill="#e36e38" stroke="#f4dfad"/></g>`;
}

function doomSvg(card, artHref) {
  const tier = TIER[card.tier];
  const titleSize = card.name.length > 19 ? 28 : card.name.length > 14 ? 33 : 39;
  const rules = wrap(card.rules);
  const ruleSize = rules.length >= 5 ? 15 : rules.length >= 4 ? 17 : 20;
  const ruleLine = ruleSize + 5;
  const ruleTop = 925 - ((rules.length - 1) * ruleLine) / 2;
  const statNames = ["attack", "defense", "health", "initiative"];
  const statCells = card.stats.map((value, index) => {
    const y = 214 + index * 140;
    return `<g><circle cx="104" cy="${y}" r="28" fill="#151a20" stroke="${tier.mid}" stroke-width="2"/>${statIcon(statNames[index], 104, y)}<text x="104" y="${y + 73}" class="statNum">${value}</text></g>`;
  }).join("");
  const ruleText = rules.map((line, index) => `<text x="371" y="${ruleTop + index * ruleLine}" class="rule">${xml(line)}</text>`).join("");
  const artScale = card.artScale ?? 1;
  const artWidth = ART.w * artScale;
  const artHeight = ART.h * artScale;
  const artX = ART.x - (artWidth - ART.w) / 2;
  const artY = ART.y - (artHeight - ART.h) / 2;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  <title>${xml(`Doom ${card.name} neutral unit card`)}</title>
  <metadata data-theme="doom" data-layout="board-game-neutral-unit" data-tier="${card.tier}"/>
  <defs>
    <linearGradient id="outer" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0a0e12"/><stop offset=".48" stop-color="#20252a"/><stop offset="1" stop-color="#090c10"/></linearGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#252b30"/><stop offset="1" stop-color="#11161a"/></linearGradient>
    <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${tier.light}"/><stop offset=".45" stop-color="${tier.mid}"/><stop offset="1" stop-color="${tier.dark}"/></linearGradient>
    <linearGradient id="band" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#331c1a"/><stop offset=".5" stop-color="#1b242b"/><stop offset="1" stop-color="#331c1a"/></linearGradient>
    <filter id="shadow"><feGaussianBlur in="SourceAlpha" stdDeviation="2"/><feOffset dy="1"/><feComponentTransfer><feFuncA type="linear" slope=".7"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <clipPath id="artClip"><rect x="${ART.x}" y="${ART.y}" width="${ART.w}" height="${ART.h}" rx="7"/></clipPath>
    <style>
      .title{font-family:Georgia,'Times New Roman',serif;font-weight:700;fill:#ffe9bd;filter:url(#shadow)}
      .statNum{font-family:Georgia,'Times New Roman',serif;font-size:38px;font-weight:700;fill:#fff3d1;text-anchor:middle;filter:url(#shadow)}
      .label{font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;fill:#d7e1e6;text-anchor:middle}
      .tier{font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.5px;fill:${tier.light};text-anchor:middle}
      .tierBadge{font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.5px;fill:#0b1118;text-anchor:middle}
      .bandMain{font-family:Georgia,'Times New Roman',serif;font-size:29px;font-weight:700;fill:#ffe9bd;text-anchor:middle;filter:url(#shadow)}
      .bandSub{font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;fill:#e26b3c;text-anchor:middle}
      .rule{font-family:Georgia,'Times New Roman',serif;font-size:${ruleSize}px;font-weight:700;fill:#f1e8d3;text-anchor:middle;filter:url(#shadow)}
    </style>
  </defs>
  <rect width="${CARD_W}" height="${CARD_H}" rx="22" fill="#05070a"/>
  <rect x="18" y="16" width="707" height="1008" rx="18" fill="url(#outer)"/>
  <rect x="26" y="24" width="691" height="992" rx="14" fill="none" stroke="url(#metal)" stroke-width="8"/>
  <rect x="38" y="36" width="667" height="968" rx="10" fill="none" stroke="#d84d2e" stroke-opacity=".28" stroke-width="2"/>
  <path d="M45 142h653M45 760h653M45 840h653" stroke="#d84d2e" stroke-opacity=".35" stroke-width="2"/>

  <rect x="48" y="44" width="647" height="92" rx="8" fill="url(#panel)" stroke="url(#metal)" stroke-width="4"/>
  <g transform="translate(79 90)"><circle r="21" fill="#1a1010" stroke="#e05e36" stroke-width="2.5"/><path d="M0-14v28M-14 0h28" stroke="#e05e36" stroke-width="2"/><circle r="6" fill="none" stroke="#f4bd52" stroke-width="2"/></g>
  <text x="355" y="102" class="title" font-size="${titleSize}" text-anchor="middle">${xml(card.name)}</text>
  <rect x="581" y="63" width="98" height="44" rx="8" fill="url(#metal)" stroke="#ffe9bd" stroke-opacity=".65" stroke-width="1.5"/>
  <text x="630" y="91" class="tierBadge">${tier.label}</text>

  <rect x="48" y="148" width="112" height="610" rx="8" fill="url(#panel)" stroke="url(#metal)" stroke-width="4"/>
  <path d="M55 352h98M55 492h98M55 632h98" stroke="#d84d2e" stroke-opacity=".28" stroke-width="2"/>
  ${statCells}
  <rect x="${ART.x - 2}" y="${ART.y - 2}" width="${ART.w + 4}" height="${ART.h + 4}" rx="8" fill="#090d11" stroke="url(#metal)" stroke-width="4"/>
  <g clip-path="url(#artClip)"><image x="${artX}" y="${artY}" width="${artWidth}" height="${artHeight}" preserveAspectRatio="xMidYMid slice" href="${xml(artHref)}" xlink:href="${xml(artHref)}"/></g>
  <g><rect x="187" y="168" width="132" height="38" rx="8" fill="#0a1016" fill-opacity=".9" stroke="#e05e36" stroke-width="1.6"/>${typeIcon(208, 187)}<text x="258" y="192" class="label">${card.kind}</text></g>

  <rect x="48" y="770" width="647" height="60" rx="8" fill="url(#band)" stroke="${tier.mid}" stroke-width="3"/>
  <text x="214" y="808" class="bandSub">NEUTRAL GUARD</text>
  <path d="M371 780v40" stroke="#e05e36" stroke-opacity=".4" stroke-width="2"/>
  <text x="531" y="808" class="bandMain">${xml(card.cost)}</text>
  <text x="531" y="822" class="bandSub">COST</text>

  <rect x="48" y="846" width="647" height="160" rx="8" fill="url(#panel)" stroke="url(#metal)" stroke-width="3"/>
  <circle cx="78" cy="875" r="17" fill="#261415" stroke="#e05e36" stroke-width="2"/><path d="M70 875h16M78 867v16" stroke="#f4bd52" stroke-width="2"/>
  ${ruleText}
</svg>`;
}

async function build(card) {
  const source = path.join(ART_DIR, card.art);
  const artBuf = await sharp(source).resize(ART.w, ART.h, { fit: "cover", position: card.artPosition ?? "centre" }).png().toBuffer();
  const artHref = `data:image/png;base64,${artBuf.toString("base64")}`;
  const svg = doomSvg(card, artHref);
  const base = `doom-${card.tier}-${card.slug}`;
  await writeFile(path.join(EDITABLE, `${base}.svg`), svg, "utf8");
  const output = path.join(PUBLIC, `${card.slug}.webp`);
  const preview = path.join(SESSION, `${base}.webp`);
  await sharp(Buffer.from(svg)).resize(CARD_W, CARD_H).webp(WEBP).toFile(output);
  await sharp(Buffer.from(svg)).resize(CARD_W, CARD_H).webp(WEBP).toFile(preview);
  return { output, preview };
}

await Promise.all([mkdir(EDITABLE, { recursive: true }), mkdir(PUBLIC, { recursive: true }), mkdir(SESSION, { recursive: true })]);
const wanted = new Set(process.argv.slice(2));
const cards = wanted.size ? CARDS.filter((card) => wanted.has(card.slug)) : CARDS;
if (!cards.length) throw new Error(`Unknown Doom card slug(s): ${[...wanted].join(", ")}`);
for (const card of cards) {
  const result = await build(card);
  console.log(`Built ${card.name}: ${result.output}`);
}

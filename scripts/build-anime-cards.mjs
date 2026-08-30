#!/usr/bin/env node

/**
 * Build editable unit-card art proofs for both Anime Mod visual registers.
 *
 * Raw generated art remains separate in scripts/anime-art/raw. Each card also
 * gets a compact, layered SVG source: art is linked, while frame, ornaments,
 * stats, title and rules are editable vectors/text. Flattened WebP proofs and a
 * contact sheet are derived outputs, never the source of truth.
 *
 * These are ART PROOFS, not playable content. They deliberately stay outside
 * public/assets until their mechanics are engine-wired and effect-tested.
 *
 * Run: node scripts/build-anime-cards.mjs [unit-slug ...]
 */

import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CARD_WIDTH = 743;
const CARD_HEIGHT = 1040;
const WEBP = { quality: 88, effort: 6 };

const TIER = {
  bronze: { label: "BRONZE", light: "#e5ad72", mid: "#9c582d", dark: "#402016" },
  silver: { label: "SILVER", light: "#e8edf5", mid: "#8794a8", dark: "#303747" },
  golden: { label: "GOLD", light: "#ffe39a", mid: "#c58c2f", dark: "#513313" }
};

const FUYUKI_CARDS = [
  {
    slug: "assassins",
    name: "Sasaki Kojirō",
    tier: "bronze",
    kind: "GROUND",
    stats: { attack: 2, defense: 1, health: 2, initiative: 8 },
    packStats: { initiative: 9 },
    art: "units-fuyuki-bronze-assassins-master.png",
    few: "No printed ability.",
    pack: "Presence Concealment — attacks do not provoke Retaliation."
  },
  {
    slug: "riders",
    name: "Medusa",
    tier: "bronze",
    kind: "GROUND",
    stats: { attack: 2, defense: 1, health: 2, initiative: 7 },
    packStats: { attack: 3, health: 3, initiative: 8 },
    art: "units-fuyuki-bronze-riders-master.png",
    few: "No printed ability.",
    pack: "Mystic Eyes — after attacking, roll a die; on 0 the target is Paralyzed."
  },
  {
    slug: "lancers",
    name: "Cú Chulainn",
    tier: "bronze",
    kind: "GROUND",
    stats: { attack: 3, defense: 1, health: 3, initiative: 6 },
    packStats: { defense: 2, initiative: 7 },
    art: "units-fuyuki-bronze-lancers-master.png",
    few: "Gáe Bolg — strike through the target for a second Attack 1 hit.",
    pack: "Gáe Bolg — strike behind the target at Attack 2."
  },
  {
    slug: "archers",
    name: "EMIYA",
    tier: "silver",
    kind: "RANGED",
    stats: { attack: 3, defense: 1, health: 4, initiative: 9 },
    packStats: { initiative: 9 },
    art: "units-fuyuki-silver-archers-master.png",
    few: "Hawkeye — ignores the adjacent ranged Combat penalty.",
    pack: "Unlimited Blade Works — ignores ranged penalties and attacks a distant target twice."
  },
  {
    slug: "casters",
    name: "Medea",
    tier: "silver",
    kind: "RANGED",
    stats: { attack: 2, defense: 1, health: 3, initiative: 4 },
    packStats: { attack: 3, defense: 1, health: 3, initiative: 6 },
    art: "units-fuyuki-silver-casters-master.png",
    few: "Rule Breaker — fixed 2 damage; once per round cap one incoming attack or Spell at 1.",
    pack: "Divine Words — fixed 3 damage; once-per-round damage cap 1; first Spell +1 Power."
  },
  {
    slug: "sabers",
    name: "Artoria Pendragon",
    tier: "golden",
    kind: "GROUND",
    stats: { attack: 5, defense: 2, health: 6, initiative: 6 },
    packStats: { attack: 6, defense: 2, health: 7, initiative: 7 },
    art: "units-fuyuki-golden-sabers-master.png",
    few: "Excalibur — a second Attack 2 hit strikes behind the target.",
    pack: "Excalibur — line Attack 3; +1 Attack after moving. Avalon Guard — +1 Defense against the first attack of each Combat round only."
  },
  {
    slug: "berserkers",
    name: "Heracles",
    tier: "golden",
    kind: "GROUND",
    stats: { attack: 6, defense: 2, health: 7, initiative: 7 },
    packStats: { attack: 7, defense: 2, health: 8, initiative: 7 },
    art: "units-fuyuki-golden-berserkers-master.png",
    few: "God Hand — once per Combat, lethal damage leaves this unit at 1 Health.",
    pack: "God Hand — Spell damage against this unit is reduced by 1; no rebirth."
  }
];

const AZURE_BREEZE_CARDS = [
  {
    slug: "outer-sect-disciples", name: "Outer Sect Disciples", vi: "Ngoại môn đệ tử",
    level: 1, tier: "bronze", traits: ["GROUND", "MELEE"], stats: { attack: 2, defense: 1, health: 2, initiative: 5 },
    packStats: { health: 3, initiative: 6 },
    art: "units-azure-breeze-bronze-outer-sect-disciples-master.png",
    few: ["No printed ability."],
    pack: ["Sword Array — adjacent friendly units gain +1 Attack on their own attacks."]
  },
  {
    slug: "inner-sect-swordsmen", name: "Inner Sect Swordsmen", vi: "Nội môn kiếm sĩ",
    level: 2, tier: "bronze", traits: ["GROUND", "MELEE"], stats: { attack: 2, defense: 1, health: 2, initiative: 7 },
    packStats: { attack: 3, health: 3, initiative: 8 },
    art: "units-azure-breeze-bronze-inner-sect-swordsmen-master.png",
    few: ["Flowing Step — Ignore Combat penalties."],
    pack: ["Flowing Step — Ignore Combat penalties."]
  },
  {
    slug: "spirit-crane", name: "Spirit Crane", vi: "Linh Cầm",
    level: 3, tier: "bronze", traits: ["FLYING", "MELEE"], stats: { attack: 2, defense: 1, health: 2, initiative: 9 },
    packStats: { attack: 3, health: 3, initiative: 10 },
    art: "units-azure-breeze-bronze-spirit-crane-master.png",
    few: ["Flying — May move over units and obstacles."],
    pack: ["Wingbeat — Flying; attacks do not provoke Retaliation."]
  },
  {
    slug: "sect-protectors", name: "Sect Formation Wardens", vi: "Hộ tông hộ pháp",
    level: 4, tier: "silver", traits: ["GROUND", "MELEE"], stats: { attack: 3, defense: 2, health: 4, initiative: 4 },
    art: "units-azure-breeze-silver-sect-protectors-master.png",
    few: ["Iron Ward — When attacked, roll the Defend die and gain its Defense token."],
    pack: ["Unbroken Guard — This unit can make unlimited Retaliation Attacks."]
  },
  {
    slug: "true-inheritors", name: "True Inheritors", vi: "Chân truyền đệ tử",
    level: 5, tier: "silver", traits: ["GROUND", "MELEE"], stats: { attack: 3, defense: 2, health: 4, initiative: 6 },
    packStats: { attack: 4, health: 5, initiative: 7 },
    art: "units-azure-breeze-silver-true-inheritors-master.png",
    few: ["Charge — +1 Attack when attacking after moving."],
    pack: ["Charge — +1 Attack when attacking after moving.", "Peerless Form — Ignores retaliation."]
  },
  {
    slug: "core-formation-master", name: "Golden Core Elders", vi: "Kim Đan Trưởng Lão",
    level: 6, tier: "golden", traits: ["RANGED", "MAGIC"], stats: { attack: 4, defense: 1, health: 6, initiative: 6 },
    packStats: { attack: 5, defense: 1, health: 7 },
    art: "units-azure-breeze-golden-core-formation-master.png",
    few: ["Talisman Arts — ignores penalties; first Spell +1 Power."],
    pack: ["Talisman Arts — ignores penalties; first Spell +1 Power.", "Talisman Aura — adjacent allies reduce Spell damage by 1."]
  },
  {
    slug: "mountain-guardian", name: "Mountain Guardian", vi: "Thủ sơn linh thú",
    level: 7, tier: "golden", traits: ["GROUND", "MELEE"], stats: { attack: 5, defense: 3, health: 8, initiative: 3 },
    packStats: { attack: 6, health: 9 },
    art: "units-azure-breeze-golden-mountain-guardian-master.png",
    few: ["Verdant Pulse — on activation, heal this unit 1 damage."],
    pack: ["Returning Earth — heal 1 on activation; unlimited Retaliation."]
  }
];

const titleCase = (value) => value.replace(/(^|[-_ ])([a-z])/g, (_m, lead, letter) => `${lead}${letter.toUpperCase()}`);
const xml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

function wrap(value, max = 47, limit = 5) {
  const words = value.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, limit);
}

function artPosition(slug) {
  // Small per-piece adjustments keep eyes and signature weapons clear of the
  // title/rules rails without modifying a single raw master.
  return {
    assassins: "xMidYMid",
    riders: "xMidYMid",
    lancers: "xMidYMid",
    archers: "xMidYMin",
    casters: "xMidYMid",
    sabers: "xMidYMid",
    berserkers: "xMidYMid"
  }[slug];
}

function statIcon(kind, x, y) {
  const common = `fill="none" stroke="#f5e8c6" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"`;
  if (kind === "attack") {
    return `<g transform="translate(${x} ${y})" ${common}><path d="M-22-19 20 23M-14-25l-9 9 9 2M14 25l9-9-9-2"/><path d="M22-19-20 23M14-25l9 9-9 2M-14 25l-9-9 9-2"/></g>`;
  }
  if (kind === "defense") {
    return `<path d="M0-27 24-19V0c0 19-10 31-24 38C-14 31-24 19-24 0v-19z" transform="translate(${x} ${y})" ${common}/>`;
  }
  if (kind === "health") {
    return `<path d="M${x - 25} ${y - 10}c0-20 27-27 34-8 8-19 35-12 35 8 0 19-22 34-35 45-13-11-34-26-34-45z" ${common}/>`;
  }
  return `<g transform="translate(${x} ${y})" ${common}><path d="M-23 20 4-28l-3 30 22-4-31 31 5-24z"/><path d="M-27 31h49"/></g>`;
}

function cardSvg(card, variant, artHref) {
  const palette = TIER[card.tier];
  const ability = card[variant];
  const lines = wrap(ability, variant === "pack" ? 43 : 45);
  const lineHeight = lines.length >= 5 ? 19 : lines.length === 4 ? 22 : 25;
  const textTop = 932 - ((lines.length - 1) * lineHeight) / 2;
  const variantLabel = variant.toUpperCase();
  const variantAccent = variant === "pack" ? "#b9a4ff" : "#8dd9ee";
  const resolvedStats = { ...card.stats, ...(variant === "pack" ? card.packStats : {}) };
  const stats = [
    ["attack", resolvedStats.attack],
    ["defense", resolvedStats.defense],
    ["health", resolvedStats.health],
    ["initiative", resolvedStats.initiative]
  ];
  const statRows = stats.map(([kind, value], index) => {
    const y = 214 + index * 142;
    return `<g id="stat-${kind}">${statIcon(kind, 98, y - 23)}<text x="98" y="${y + 43}" class="statNumber">${value}</text></g>`;
  }).join("");
  const ruleText = lines.map((line, index) => `<tspan x="418" y="${textTop + index * lineHeight}">${xml(line)}</tspan>`).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
  <title>${xml(`Fuyuki City ${card.name ?? titleCase(card.slug)} ${variantLabel} art proof`)}</title>
  <metadata data-status="art-proof-not-playable" data-source="docs/anime-mod-plan.md" data-master="${xml(card.art)}"/>
  <defs>
    <linearGradient id="outer" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#130d1f"/><stop offset=".48" stop-color="#322247"/><stop offset="1" stop-color="#0b0912"/></linearGradient>
    <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${palette.light}"/><stop offset=".35" stop-color="${palette.mid}"/><stop offset=".68" stop-color="${palette.dark}"/><stop offset="1" stop-color="${palette.light}"/></linearGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#352646"/><stop offset="1" stop-color="#171020"/></linearGradient>
    <linearGradient id="rail" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#21162d"/><stop offset=".5" stop-color="#49335e"/><stop offset="1" stop-color="#1b1225"/></linearGradient>
    <radialGradient id="seal"><stop stop-color="#d2c1ff" stop-opacity=".28"/><stop offset="1" stop-color="#7055a2" stop-opacity="0"/></radialGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>
    <filter id="textShadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur in="SourceAlpha" stdDeviation="2"/><feOffset dy="2"/><feComponentTransfer><feFuncA type="linear" slope=".8"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <clipPath id="artClip"><rect x="169" y="146" width="526" height="668" rx="8"/></clipPath>
    <style>
      .display { font-family: "Liberation Serif", Georgia, serif; font-weight: 700; letter-spacing: 1px; }
      .smallcaps { font-family: "Liberation Serif", Georgia, serif; font-weight: 700; letter-spacing: 3px; }
      .statNumber { fill: #fff3d5; font-family: "Liberation Serif", Georgia, serif; font-size: 43px; font-weight: 700; text-anchor: middle; filter: url(#textShadow); }
    </style>
  </defs>

  <g inkscape:groupmode="layer" inkscape:label="01 Background" id="layer-background">
    <rect width="743" height="1040" rx="28" fill="#07060a"/>
    <rect x="20" y="18" width="703" height="1004" rx="22" fill="url(#outer)"/>
  </g>

  <g inkscape:groupmode="layer" inkscape:label="02 Illustration (linked master)" id="layer-art" clip-path="url(#artClip)">
    <rect x="169" y="146" width="526" height="668" fill="#0b0b16"/>
    <image id="linked-master" x="169" y="146" width="526" height="668" preserveAspectRatio="${artPosition(card.slug)} slice" href="${xml(artHref)}" xlink:href="${xml(artHref)}"/>
    <rect x="169" y="146" width="526" height="668" fill="url(#seal)" opacity=".28"/>
  </g>

  <g inkscape:groupmode="layer" inkscape:label="03 Frame and ornaments" id="layer-frame">
    <rect x="32" y="30" width="679" height="968" rx="16" fill="none" stroke="#09070c" stroke-width="22"/>
    <rect x="33" y="31" width="677" height="966" rx="15" fill="none" stroke="url(#metal)" stroke-width="8"/>
    <rect x="43" y="41" width="657" height="946" rx="11" fill="none" stroke="#e9cc83" stroke-opacity=".5" stroke-width="2"/>

    <rect x="49" y="50" width="645" height="78" rx="8" fill="url(#panel)" stroke="url(#metal)" stroke-width="5"/>
    <path d="M55 120h633M55 58h633" stroke="#f4d990" stroke-opacity=".4"/>
    <circle cx="651" cy="89" r="26" fill="none" stroke="${variantAccent}" stroke-opacity=".45" stroke-width="2"/>
    <circle cx="651" cy="89" r="14" fill="none" stroke="${variantAccent}" stroke-opacity=".75"/>
    <path d="m651 61 7 18 19 2-15 12 5 19-16-10-16 10 5-19-15-12 19-2z" fill="none" stroke="${variantAccent}" stroke-width="1.5" opacity=".75"/>

    <rect x="49" y="143" width="108" height="674" rx="8" fill="url(#rail)" stroke="url(#metal)" stroke-width="5"/>
    <rect x="166" y="143" width="532" height="674" rx="9" fill="none" stroke="url(#metal)" stroke-width="6"/>
    ${[288, 430, 572].map((y) => `<path d="M53 ${y}h100" stroke="#e4c779" stroke-opacity=".5" stroke-width="2"/>`).join("")}
    ${statRows}

    <rect x="49" y="827" width="649" height="51" rx="7" fill="url(#rail)" stroke="url(#metal)" stroke-width="4"/>
    <path d="M61 851h178M504 851h182" stroke="${variantAccent}" stroke-opacity=".45" stroke-width="2"/>
    <circle cx="271" cy="852" r="7" fill="${variantAccent}" opacity=".75"/>
    <circle cx="466" cy="852" r="7" fill="${variantAccent}" opacity=".75"/>

    <rect x="49" y="888" width="649" height="88" rx="8" fill="url(#panel)" stroke="url(#metal)" stroke-width="4"/>
    <circle cx="91" cy="932" r="24" fill="#1b1226" stroke="${variantAccent}" stroke-width="2"/>
    <path d="M78 934c11-17 19-20 28-19-3 7-2 13 3 20-12-5-21-2-31 8 4-5 5-7 0-9z" fill="none" stroke="#f7e9bf" stroke-width="3" stroke-linecap="round"/>

    <path d="M40 86q34-48 80-47M703 86q-34-48-80-47M40 944q34 48 80 47M703 944q-34 48-80 47" fill="none" stroke="${palette.light}" stroke-width="3" opacity=".8"/>
    <path d="M50 75q24-23 50-25M693 75q-24-23-50-25M50 955q24 23 50 25M693 955q-24 23-50 25" fill="none" stroke="${variantAccent}" stroke-width="2" opacity=".7"/>
  </g>

  <g inkscape:groupmode="layer" inkscape:label="04 Editable typography" id="layer-type">
    <text x="363" y="102" class="display" fill="#fff0c2" font-size="${(card.name ?? titleCase(card.slug)).length > 17 ? 34 : 43}" text-anchor="middle" filter="url(#textShadow)">${xml(card.name ?? titleCase(card.slug))}</text>
    <text x="367" y="863" class="smallcaps" fill="#f8edcf" font-size="26" text-anchor="middle">${variantLabel}</text>
    <text x="184" y="177" class="smallcaps" fill="#fff4d2" font-size="17" filter="url(#textShadow)">${card.kind}</text>
    <g transform="translate(657 784)">
      <circle r="22" fill="${palette.dark}" stroke="${palette.light}" stroke-width="3"/>
      <path d="m0-14 4 9 10 1-8 6 3 10-9-6-9 6 3-10-8-6 10-1z" fill="${palette.light}"/>
    </g>
    <text x="622" y="791" class="smallcaps" fill="${palette.light}" font-size="14" text-anchor="end">${palette.label}</text>
    <text class="display" fill="#fff1d3" font-size="${lines.length >= 5 ? 17.5 : lines.length === 4 ? 19 : lines.length === 3 ? 20.5 : 23}" text-anchor="middle">${ruleText}</text>
  </g>
</svg>`;
}

function classicStatIcon(kind, x, y) {
  const common = `fill="none" stroke="#dce4c5" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" filter="url(#iconShadow)"`;
  if (kind === "attack") {
    return `<g id="icon-attack-crossed-jian" transform="translate(${x} ${y})" ${common}>
      <path d="M-24-23 21 22M-16-28l-13 13 12 1M15 28l13-13-12-1"/>
      <path d="M24-23-21 22M16-28l13 13-12 1M-15 28l-13-13 12-1"/>
      <path d="m-10 17-7 11M10 17l7 11" stroke="#8ab39a"/>
    </g>`;
  }
  if (kind === "defense") {
    return `<g id="icon-defense-jade-shield" transform="translate(${x} ${y})" ${common}>
      <path d="M0-30 27-20V1c0 22-11 37-27 45C-16 38-27 23-27 1v-21z" fill="#183d35" stroke="#dce4c5"/>
      <path d="M0-21 17-14V1c0 13-6 24-17 31C-11 25-17 14-17 1v-15z" stroke="#86ad91"/>
      <circle r="8"/><path d="M0-8a8 8 0 0 0 0 16M0-8a4 4 0 0 1 0 8M0 0a4 4 0 0 0 0 8" stroke-width="2.7"/>
    </g>`;
  }
  if (kind === "health") {
    return `<g id="icon-health-lotus-cross" transform="translate(${x} ${y})" ${common}>
      <path d="M-11-29H11V-11H29V11H11V29H-11V11H-29V-11H-11Z" fill="#d7d7a4" stroke="#f2e7bd"/>
      <path d="M0 18C-7 10-15 8-20 9-17 1-10-5 0-10 10-5 17 1 20 9 15 8 7 10 0 18Z" fill="#4f846d" stroke="#315f50" stroke-width="2.5"/>
    </g>`;
  }
  return `<g id="icon-initiative-cloud-step" transform="translate(${x} ${y})" ${common}>
    <circle cx="10" cy="-22" r="7" fill="#dce4c5"/>
    <path d="M7-13-2 4l-17 7M-2 4l12 8 15-3M4-6l17 2M10 12 2 29M-18 22h25c9 0 12-8 7-12"/>
    <path d="M-25 31H9c8 0 12-6 8-11" stroke="#8ab39a" stroke-width="3"/>
  </g>`;
}

function classicTypeIcon(trait, x, y) {
  const common = `fill="none" stroke="#e5e2b1" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" filter="url(#iconShadow)"`;
  if (trait === "FLYING") {
    return `<g id="type-flying-wing" transform="translate(${x} ${y})" ${common}><path d="M-20 11C-7-17 12-20 23-15 13-8 10-1 12 7 4 2-3 5-8 13 0 9 7 11 13 17 0 14-11 14-20 11Z"/><path d="M-8 12 14-10"/></g>`;
  }
  if (trait === "RANGED") {
    return `<g id="type-ranged-bow" transform="translate(${x} ${y})" ${common}><path d="M-11-20C11-11 11 11-11 20M-11-20v40M-20 0h39M12-5l8 5-8 5"/></g>`;
  }
  return `<g id="type-ground-boot" transform="translate(${x} ${y})" ${common}><path d="M-13-19h15v19c7 7 15 10 24 10v13h-44v-11c7-3 9-9 5-17z"/><path d="M-11 6c8 4 18 6 31 5" stroke="#8ab39a"/></g>`;
}

/** Ninefold Realms layout v3: the original board game's exact hierarchy and
 * density, reskinned with one generated jade/leather frame master. Only the
 * illustration and frame are linked rasters; icons, numbers and text remain
 * precise editable SVG layers. */
function ninefoldCardSvg(card, variant, artHref, frameHref) {
  const palette = TIER[card.tier];
  const resolvedStats = { ...card.stats, ...(variant === "pack" ? card.packStats : {}) };
  const rules = Array.isArray(card[variant]) ? card[variant] : [card[variant]];
  const wrappedRules = rules.map((rule) => wrap(rule, 54, 7));
  const totalRuleLines = wrappedRules.reduce((sum, lines) => sum + lines.length, 0);
  const ruleFontSize = totalRuleLines >= 7 ? 14.5 : totalRuleLines >= 5 ? 16 : totalRuleLines >= 3 ? 18 : 21;
  const ruleLineHeight = ruleFontSize + 3;
  const ruleGap = rules.length > 1 ? 6 : 0;
  const ruleBlockHeight = totalRuleLines * ruleLineHeight + (rules.length - 1) * ruleGap;
  let ruleY = 848 + (155 - ruleBlockHeight) / 2 + ruleLineHeight * 0.78;
  const variantLabel = variant.toUpperCase();
  const variantAccent = variant === "pack" ? "#e0c17e" : "#9cc8b2";
  const titleSize = card.name.length > 20 ? 30 : card.name.length > 16 ? 34 : 41;
  const primaryType = card.traits[0];
  const statEntries = [
    ["attack", resolvedStats.attack],
    ["defense", resolvedStats.defense],
    ["health", resolvedStats.health],
    ["initiative", resolvedStats.initiative]
  ];
  const statCells = statEntries.map(([kind, value], index) => {
    const cellTop = 158 + index * 148;
    return `<g id="stat-${kind}">
      ${classicStatIcon(kind, 118, cellTop + 47)}
      <text x="118" y="${cellTop + 116}" class="statNumber">${value}</text>
    </g>`;
  }).join("");
  const ruleText = wrappedRules.map((lines) => {
    const firstY = ruleY;
    const lineMarkup = lines.map((line, index) => `<text x="384" y="${ruleY + index * ruleLineHeight}" class="ruleText">${xml(line)}</text>`).join("");
    ruleY += lines.length * ruleLineHeight + ruleGap;
    return `<path d="M84 ${firstY - 9}q10-9 20 0-10 2-13 12-2-8-7-12Z" fill="${variantAccent}"/>${lineMarkup}`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
  <title>${xml(`Azure Breeze Sect ${card.name} ${variantLabel} art proof`)}</title>
  <metadata data-status="art-proof-not-playable" data-layout="ninefold-board-game-classic-v3" data-source="docs/anime-mod-plan.md" data-master="${xml(card.art)}" data-frame="units-azure-breeze-board-game-frame-master.png" data-level="${card.level}" data-variant="${variant}" data-attack="${resolvedStats.attack}" data-defense="${resolvedStats.defense}" data-health="${resolvedStats.health}" data-initiative="${resolvedStats.initiative}" data-traits="${xml(card.traits.join(","))}" data-rule-capacity-lines="7"/>
  <defs>
    <linearGradient id="variantBand" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#4a2d1d"/><stop offset=".52" stop-color="#29170f"/><stop offset="1" stop-color="#1a0d09"/></linearGradient>
    <filter id="textShadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur in="SourceAlpha" stdDeviation="2"/><feOffset dy="2"/><feComponentTransfer><feFuncA type="linear" slope=".8"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="iconShadow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur in="SourceAlpha" stdDeviation="1.6"/><feOffset dx="1.5" dy="2"/><feComponentTransfer><feFuncA type="linear" slope=".85"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <clipPath id="paintingClip"><rect x="173" y="157" width="509" height="597"/></clipPath>
    <style>
      .display { font-family: "Liberation Serif", Georgia, serif; font-weight: 700; }
      .smallcaps { font-family: "Liberation Serif", Georgia, serif; font-weight: 700; letter-spacing: 2.5px; }
      .statNumber { fill: #fff0c8; font-family: "Liberation Serif", Georgia, serif; font-size: 40px; font-weight: 700; text-anchor: middle; filter: url(#textShadow); }
      .typeLabel { fill: #e8e2b4; font-family: Arial, sans-serif; font-size: 13px; font-weight: 700; letter-spacing: 2px; filter: url(#textShadow); }
      .ruleText { fill: #f3e8c7; font-family: "Liberation Serif", Georgia, serif; font-size: ${ruleFontSize}px; font-weight: 700; text-anchor: middle; filter: url(#textShadow); }
    </style>
  </defs>

  <g inkscape:groupmode="layer" inkscape:label="01 Generated classic board-game frame (linked master)" id="layer-background">
    <image id="linked-frame" x="0" y="0" width="743" height="1040" preserveAspectRatio="none" href="${xml(frameHref)}" xlink:href="${xml(frameHref)}"/>
  </g>

  <g inkscape:groupmode="layer" inkscape:label="02 Illustration (linked master)" id="layer-art" clip-path="url(#paintingClip)">
    <rect x="173" y="157" width="509" height="597" fill="#1c100b"/>
    <image id="linked-master" x="173" y="157" width="509" height="597" preserveAspectRatio="${card.artPosition ?? "xMidYMid"} slice" href="${xml(artHref)}" xlink:href="${xml(artHref)}"/>
  </g>

  <g inkscape:groupmode="layer" inkscape:label="03 Classic board-game alignment panels" id="layer-frame">
    <rect x="171" y="155" width="513" height="601" fill="none" stroke="#c79b61" stroke-width="3"/>
    <rect x="69" y="762" width="614" height="77" fill="url(#variantBand)" stroke="#bd9057" stroke-width="3"/>
    <path d="M77 770h598M77 831h598" stroke="#6e9a7f" stroke-opacity=".55" stroke-width="2"/>
  </g>

  <g inkscape:groupmode="layer" inkscape:label="04 Editable classic icons and stat values" id="layer-icons">
    <g id="left-stat-rail">${statCells}</g>
    <g id="primary-type">
      ${classicTypeIcon(primaryType, 202, 184)}
      <text x="232" y="190" class="typeLabel">${primaryType}</text>
    </g>
    <g id="tier-star" transform="translate(648 101)">
      <path d="m0-27 7 18 20 1-15 12 5 20-17-11-17 11 5-20-15-12 20-1z" fill="${palette.light}" stroke="${palette.dark}" stroke-width="2.5" filter="url(#iconShadow)"/>
      <text x="0" y="42" class="smallcaps" fill="${palette.light}" font-size="11" text-anchor="middle" filter="url(#textShadow)">LV ${card.level}</text>
    </g>
  </g>

  <g inkscape:groupmode="layer" inkscape:label="05 Editable original-style typography and rules" id="layer-type">
    <text x="371" y="105" class="display" fill="#f5dda0" font-size="${titleSize}" text-anchor="middle" filter="url(#textShadow)">${xml(card.name)}</text>
    <text x="371" y="135" fill="#c8d6b9" font-family="Liberation Serif, Georgia, serif" font-size="17" font-style="italic" font-weight="700" text-anchor="middle" filter="url(#textShadow)">${xml(card.vi)}</text>
    <text x="376" y="814" class="display" fill="#f5dda0" font-size="34" text-anchor="middle" filter="url(#textShadow)"># ${variantLabel}</text>
    <g id="editable-rules">${ruleText}</g>
  </g>
</svg>`;
}

const dataUriCache = new Map();

async function artDataUri(rawDir, file) {
  const key = path.join(rawDir, file);
  if (dataUriCache.has(key)) return dataUriCache.get(key);
  const buffer = await readFile(path.join(rawDir, file));
  const uri = `data:image/png;base64,${buffer.toString("base64")}`;
  dataUriCache.set(key, uri);
  return uri;
}

async function buildCard(theme, card, variant) {
  const name = `units-${theme.assetPrefix}-${card.tier}-${card.slug}-${variant}`;
  const editableArtHref = `../../../raw/${theme.directory}/units/${card.art}`;
  const editableFrameHref = theme.frame
    ? `../../../raw/${theme.directory}/frame/${theme.frame.file}`
    : undefined;
  const sourceSvg = theme.render(card, variant, editableArtHref, editableFrameHref);
  const svgPath = path.join(theme.editable, `${name}.svg`);
  await writeFile(svgPath, sourceSvg, "utf8");

  const renderFrameHref = theme.frame
    ? await artDataUri(theme.frame.raw, theme.frame.file)
    : undefined;
  const renderSvg = theme.render(card, variant, await artDataUri(theme.raw, card.art), renderFrameHref);
  const previewPath = path.join(theme.previews, `${name}.webp`);
  const previewBuffer = await sharp(Buffer.from(renderSvg))
    .resize(CARD_WIDTH, CARD_HEIGHT, { fit: "fill" })
    .webp(WEBP)
    .toBuffer();
  // Buffer first, then commit with Node's file writer. This avoids intermittent
  // libvips destination-handle failures on Windows while preserving the exact
  // same WebP output.
  await writeFile(previewPath, previewBuffer);
  return { card, variant, previewPath, svgPath };
}

const themePath = (section, directory) => path.join(ROOT, "scripts", "anime-art", section, directory, "units");

async function pruneRetiredThemeOutputs(theme) {
  const expected = new Set(theme.cards.flatMap((card) => ["few", "pack"].flatMap((variant) => {
    const stem = `units-${theme.assetPrefix}-${card.tier}-${card.slug}-${variant}`;
    return [`${stem}.svg`, `${stem}.webp`];
  })));
  for (const directory of [theme.editable, theme.previews]) {
    const files = await readdir(directory);
    await Promise.all(files
      .filter((file) => file.startsWith(`units-${theme.assetPrefix}-`) && !expected.has(file))
      .map((file) => unlink(path.join(directory, file))));
  }
}

const THEMES = [
  {
    id: "fuyuki",
    assetPrefix: "fuyuki",
    directory: "fuyuki",
    cards: FUYUKI_CARDS,
    render: cardSvg,
    raw: themePath("raw", "fuyuki"),
    editable: themePath("editable", "fuyuki"),
    previews: themePath("previews", "fuyuki"),
    contactSheet: path.join(ROOT, "docs", "anime-fuyuki-unit-cards-contact-sheet.webp"),
    contactBackground: "#0d0913"
  },
  {
    id: "azure-breeze",
    assetPrefix: "azure-breeze",
    directory: "azure-breeze",
    cards: AZURE_BREEZE_CARDS,
    render: ninefoldCardSvg,
    raw: themePath("raw", "azure-breeze"),
    frame: {
      raw: path.join(ROOT, "scripts", "anime-art", "raw", "azure-breeze", "frame"),
      file: "units-azure-breeze-board-game-frame-master.png"
    },
    editable: themePath("editable", "azure-breeze"),
    previews: themePath("previews", "azure-breeze"),
    contactSheet: path.join(ROOT, "docs", "anime-azure-breeze-unit-cards-contact-sheet.webp"),
    contactBackground: "#17231d"
  }
];

async function buildTheme(theme, requested) {
  await Promise.all([mkdir(theme.editable, { recursive: true }), mkdir(theme.previews, { recursive: true })]);
  const themeExplicit = requested.has(theme.id);
  if (!requested.size || themeExplicit) await pruneRetiredThemeOutputs(theme);
  const selected = requested.size && !themeExplicit
    ? theme.cards.filter((card) => requested.has(card.slug))
    : theme.cards;
  if (!selected.length) return [];

  const outputs = [];
  for (const card of selected) {
    outputs.push(await buildCard(theme, card, "few"));
    outputs.push(await buildCard(theme, card, "pack"));
  }

  const tileWidth = 223;
  const tileHeight = 312;
  const gap = 18;
  const cols = 4;
  const rows = Math.ceil(outputs.length / cols);
  const tiles = await Promise.all(outputs.map(({ previewPath }) => sharp(previewPath).resize(tileWidth, tileHeight).png().toBuffer()));
  const contactSheetBuffer = await sharp({
    create: {
      width: cols * tileWidth + (cols + 1) * gap,
      height: rows * tileHeight + (rows + 1) * gap,
      channels: 4,
      background: theme.contactBackground
    }
  })
    .composite(tiles.map((input, index) => ({
      input,
      left: gap + (index % cols) * (tileWidth + gap),
      top: gap + Math.floor(index / cols) * (tileHeight + gap)
    })))
    .webp({ quality: 90, effort: 6 })
    .toBuffer();
  await writeFile(theme.contactSheet, contactSheetBuffer);
  return outputs;
}

const requested = new Set(process.argv.slice(2));
const selectedThemes = requested.size && THEMES.some((theme) => requested.has(theme.id))
  ? THEMES.filter((theme) => requested.has(theme.id))
  : THEMES;
const allOutputs = [];
for (const theme of selectedThemes) {
  const outputs = await buildTheme(theme, requested);
  allOutputs.push(...outputs);
  if (outputs.length) console.log(path.relative(ROOT, theme.contactSheet));
}
if (!allOutputs.length) throw new Error(`No matching cards or themes: ${[...requested].join(", ")}`);
for (const output of allOutputs) {
  console.log(path.relative(ROOT, output.svgPath));
  console.log(path.relative(ROOT, output.previewPath));
}

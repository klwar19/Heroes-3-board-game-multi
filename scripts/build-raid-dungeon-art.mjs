/**
 * Raid Bosses & Dungeon — PROCEDURAL PLACEHOLDER art (committed, functional,
 * deliberately upgradeable — see docs/raid-dungeon-art.md for the upgrade
 * directions a future image-gen pass should follow).
 *
 * Outputs (all webp, deterministic — re-running reproduces identical art):
 *  - public/assets/bosses/<id>.webp            — 8 boss card faces, 743×1040
 *  - public/assets/bosses/rift_lair_field.webp — map hex art, 512×512
 *  - public/assets/bosses/dungeon_gate_field.webp — map hex art, 512×512
 *
 * Run: node scripts/build-raid-dungeon-art.mjs
 */

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public", "assets", "bosses");
const CARD_W = 743;
const CARD_H = 1040;
const HEX = 512;
const WEBP = { quality: 92, effort: 6 };

/** The boss faces: id → { name, title, layers, hues: [deep, mid, glow] }. */
const BOSSES = [
  { id: "goblin_king", name: "GOBLIN KING", title: "Tyrant of the Warrens", layers: 3, hues: ["#101a0c", "#2c4d1e", "#9adb4f"] },
  { id: "colossal_titan", name: "COLOSSAL TITAN", title: "The Walking Calamity", layers: 5, hues: ["#141216", "#463f45", "#d9c9c0"] },
  { id: "abyss_kraken", name: "ABYSS KRAKEN", title: "Terror of the Deep", layers: 4, hues: ["#06131a", "#0e3c4a", "#4fd0db"] },
  { id: "calamity_dragon", name: "CALAMITY DRAGON", title: "Herald of the Rift", layers: 6, hues: ["#1a0b08", "#57190f", "#ff8a3d"] },
  { id: "avatar_of_erebos", name: "AVATAR OF EREBOS", title: "The God That Walks", layers: 7, hues: ["#0d0716", "#2c1650", "#a86bff"] },
  { id: "minotaur_of_the_depths", name: "MINOTAUR OF THE DEPTHS", title: "Warden of Floor 5", layers: 2, hues: ["#170f08", "#4a2c14", "#e0a054"] },
  { id: "floor_wyrm", name: "THE FLOOR WYRM", title: "Warden of Floor 10", layers: 2, hues: ["#12130f", "#3d4034", "#d8dcc2"] },
  { id: "custom_boss", name: "CUSTOM BOSS", title: "Designer's Nightmare", layers: 4, hues: ["#101216", "#2e3440", "#9fb4d9"] }
];

/** Tiny deterministic hash → 0..1 stream, seeded off a string. */
function seeded(seedText) {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 10000) / 10000;
  };
}

function initialsOf(name) {
  const words = name.split(/\s+/).filter((word) => word !== "OF" && word !== "THE");
  return words.slice(0, 2).map((word) => word[0]).join("");
}

/** The jagged sigil ring: N spikes (N = layers), plus concentric circles. */
function sigil(cx, cy, radius, spikes, glow, rand) {
  const points = [];
  for (let i = 0; i < spikes * 2; i += 1) {
    const angle = (Math.PI * 2 * i) / (spikes * 2) - Math.PI / 2;
    const r = i % 2 === 0 ? radius * (1.18 + rand() * 0.08) : radius * 0.92;
    points.push(`${(cx + Math.cos(angle) * r).toFixed(1)},${(cy + Math.sin(angle) * r).toFixed(1)}`);
  }
  return `
    <polygon points="${points.join(" ")}" fill="none" stroke="${glow}" stroke-width="5" opacity="0.85"/>
    <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${glow}" stroke-width="3" opacity="0.6"/>
    <circle cx="${cx}" cy="${cy}" r="${radius * 0.72}" fill="none" stroke="${glow}" stroke-width="1.6" opacity="0.45"/>`;
}

function cornerFlourish(x, y, sx, sy, gold) {
  return `<path d="M ${x} ${y + 70 * sy} Q ${x} ${y}, ${x + 70 * sx} ${y} M ${x} ${y + 44 * sy} Q ${x} ${y}, ${x + 44 * sx} ${y}"
    fill="none" stroke="${gold}" stroke-width="4" stroke-linecap="round"/>`;
}

function bossFaceSvg(boss) {
  const rand = seeded(boss.id);
  const [deep, mid, glow] = boss.hues;
  const gold = "#c9a24b";
  const cx = CARD_W / 2;
  const emblemY = 560;
  const pipCount = boss.layers;
  const pipRow = Array.from({ length: pipCount }, (_, i) => {
    const width = 46;
    const gap = 14;
    const total = pipCount * width + (pipCount - 1) * gap;
    const x = cx - total / 2 + i * (width + gap);
    return `<rect x="${x}" y="${CARD_H - 118}" width="${width}" height="20" rx="5"
      fill="${glow}" opacity="0.9" stroke="#00000088" stroke-width="1.5"/>`;
  }).join("");
  const custom = boss.id === "custom_boss"
    ? `<text x="${cx + pipCount * 33 + 26}" y="${CARD_H - 100}" font-family="Georgia, serif" font-size="34" fill="${glow}" text-anchor="middle">?</text>`
    : "";
  // A faint scatter of embers/motes, seeded.
  const motes = Array.from({ length: 26 }, () => {
    const x = 60 + rand() * (CARD_W - 120);
    const y = 220 + rand() * (CARD_H - 420);
    const r = 1.5 + rand() * 3;
    return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" fill="${glow}" opacity="${(0.12 + rand() * 0.3).toFixed(2)}"/>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="46%" r="75%">
      <stop offset="0%" stop-color="${mid}"/>
      <stop offset="62%" stop-color="${deep}"/>
      <stop offset="100%" stop-color="#050408"/>
    </radialGradient>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${glow}" stop-opacity="0.5"/>
      <stop offset="70%" stop-color="${glow}" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="${glow}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${CARD_W}" height="${CARD_H}" fill="url(#bg)"/>
  ${motes}
  <!-- ornate double frame -->
  <rect x="18" y="18" width="${CARD_W - 36}" height="${CARD_H - 36}" fill="none" stroke="${gold}" stroke-width="6" rx="14"/>
  <rect x="34" y="34" width="${CARD_W - 68}" height="${CARD_H - 68}" fill="none" stroke="${gold}" stroke-width="2" rx="10" opacity="0.8"/>
  ${cornerFlourish(52, 52, 1, 1, gold)}
  ${cornerFlourish(CARD_W - 52, 52, -1, 1, gold)}
  ${cornerFlourish(52, CARD_H - 52, 1, -1, gold)}
  ${cornerFlourish(CARD_W - 52, CARD_H - 52, -1, -1, gold)}
  <!-- name plate -->
  <rect x="90" y="86" width="${CARD_W - 180}" height="120" rx="12" fill="#00000066" stroke="${gold}" stroke-width="2"/>
  <text x="${cx}" y="146" font-family="Georgia, 'Times New Roman', serif" font-size="${boss.name.length > 16 ? 42 : 52}" font-weight="bold"
    fill="#efe3c2" text-anchor="middle" letter-spacing="3">${boss.name}</text>
  <text x="${cx}" y="188" font-family="Georgia, serif" font-size="26" font-style="italic" fill="${glow}" text-anchor="middle">${boss.title}</text>
  <!-- central emblem -->
  <circle cx="${cx}" cy="${emblemY}" r="300" fill="url(#halo)"/>
  ${sigil(cx, emblemY, 210, boss.layers, glow, rand)}
  <text x="${cx}" y="${emblemY + 62}" font-family="Georgia, serif" font-size="200" font-weight="bold"
    fill="#0a0a0aCC" stroke="${glow}" stroke-width="4" text-anchor="middle">${initialsOf(boss.name)}</text>
  <!-- layer pips -->
  <text x="${cx}" y="${CARD_H - 138}" font-family="Georgia, serif" font-size="22" fill="#cdbf9d" text-anchor="middle" letter-spacing="2">HEALTH LAYERS</text>
  ${pipRow}
  ${custom}
</svg>`;
}

function riftLairHexSvg() {
  const c = HEX / 2;
  const rand = seeded("rift_lair");
  const cracks = Array.from({ length: 9 }, (_, i) => {
    const angle = (Math.PI * 2 * i) / 9 + rand() * 0.4;
    const len = 140 + rand() * 90;
    const midR = len * (0.4 + rand() * 0.2);
    const bend = (rand() - 0.5) * 60;
    const x1 = c + Math.cos(angle) * 18;
    const y1 = c + Math.sin(angle) * 18;
    const xm = c + Math.cos(angle) * midR + Math.cos(angle + Math.PI / 2) * bend;
    const ym = c + Math.sin(angle) * midR + Math.sin(angle + Math.PI / 2) * bend;
    const x2 = c + Math.cos(angle) * len;
    const y2 = c + Math.sin(angle) * len;
    return `<path d="M ${x1.toFixed(0)} ${y1.toFixed(0)} Q ${xm.toFixed(0)} ${ym.toFixed(0)}, ${x2.toFixed(0)} ${y2.toFixed(0)}"
      fill="none" stroke="#e0b8ff" stroke-width="${(4 - i * 0.3).toFixed(1)}" opacity="${(0.9 - i * 0.06).toFixed(2)}" stroke-linecap="round"/>`;
  }).join("");
  const spikes = Array.from({ length: 12 }, (_, i) => {
    const x = 30 + i * ((HEX - 60) / 11) + (rand() - 0.5) * 14;
    const h = 40 + rand() * 55;
    return `<polygon points="${x - 12},${HEX - 34} ${x},${HEX - 34 - h} ${x + 12},${HEX - 34}" fill="#120a1c" stroke="#3d2360" stroke-width="1.5"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${HEX}" height="${HEX}" viewBox="0 0 ${HEX} ${HEX}">
  <defs>
    <radialGradient id="rift" cx="50%" cy="46%" r="70%">
      <stop offset="0%" stop-color="#5b2a8f"/>
      <stop offset="35%" stop-color="#2a1247"/>
      <stop offset="100%" stop-color="#0b0512"/>
    </radialGradient>
  </defs>
  <rect width="${HEX}" height="${HEX}" fill="url(#rift)"/>
  <circle cx="${c}" cy="${c}" r="150" fill="none" stroke="#b25aff" stroke-width="8" opacity="0.35"/>
  <circle cx="${c}" cy="${c}" r="110" fill="none" stroke="#ff5a7a" stroke-width="5" opacity="0.3"/>
  ${cracks}
  <circle cx="${c}" cy="${c}" r="26" fill="#f4e6ff"/>
  <circle cx="${c}" cy="${c}" r="44" fill="none" stroke="#f4e6ff" stroke-width="3" opacity="0.7"/>
  ${spikes}
</svg>`;
}

function dungeonGateHexSvg() {
  const c = HEX / 2;
  // The arch: keystone blocks along a semicircle.
  const blocks = Array.from({ length: 11 }, (_, i) => {
    const angle = Math.PI - (Math.PI * i) / 10;
    const r = 168;
    const x = c + Math.cos(angle) * r;
    const y = 300 - Math.sin(angle) * r;
    const deg = ((angle * 180) / Math.PI - 90).toFixed(1);
    return `<rect x="${(x - 26).toFixed(0)}" y="${(y - 40).toFixed(0)}" width="52" height="64" rx="4"
      fill="#57534d" stroke="#241f1b" stroke-width="3" transform="rotate(${deg} ${x.toFixed(0)} ${y.toFixed(0)})"/>`;
  }).join("");
  const stairs = Array.from({ length: 4 }, (_, i) => {
    const width = 200 - i * 42;
    const y = 430 - i * 34;
    const shade = 20 + i * 14;
    return `<rect x="${c - width / 2}" y="${y}" width="${width}" height="30" fill="rgb(${shade},${shade},${shade + 6})"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${HEX}" height="${HEX}" viewBox="0 0 ${HEX} ${HEX}">
  <defs>
    <linearGradient id="rock" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#4c463f"/>
      <stop offset="60%" stop-color="#2e2a25"/>
      <stop offset="100%" stop-color="#17140f"/>
    </linearGradient>
    <radialGradient id="torch" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffb84d" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#ffb84d" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${HEX}" height="${HEX}" fill="url(#rock)"/>
  <!-- the black maw + descending stair suggestion -->
  <path d="M ${c - 168} 460 L ${c - 168} 300 A 168 168 0 0 1 ${c + 168} 300 L ${c + 168} 460 Z" fill="#050505"/>
  ${stairs}
  ${blocks}
  <rect x="${c - 196}" y="452" width="392" height="26" fill="#57534d" stroke="#241f1b" stroke-width="3"/>
  <!-- torches -->
  <circle cx="${c - 196}" cy="286" r="52" fill="url(#torch)"/>
  <circle cx="${c + 196}" cy="286" r="52" fill="url(#torch)"/>
  <rect x="${c - 202}" y="286" width="12" height="70" fill="#241f1b"/>
  <rect x="${c + 190}" y="286" width="12" height="70" fill="#241f1b"/>
  <polygon points="${c - 196},262 ${c - 208},292 ${c - 184},292" fill="#ffd27a"/>
  <polygon points="${c + 196},262 ${c + 184},292 ${c + 208},292" fill="#ffd27a"/>
</svg>`;
}

async function renderTo(filePath, svg, width, height) {
  await sharp(Buffer.from(svg)).resize(width, height, { fit: "fill" }).webp(WEBP).toFile(filePath);
  const meta = await sharp(filePath).metadata();
  if (meta.width !== width || meta.height !== height) {
    throw new Error(`${path.basename(filePath)}: got ${meta.width}x${meta.height}, wanted ${width}x${height}`);
  }
  console.log(`✔ ${path.relative(ROOT, filePath)} (${width}x${height})`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const boss of BOSSES) {
    await renderTo(path.join(OUT_DIR, `${boss.id}.webp`), bossFaceSvg(boss), CARD_W, CARD_H);
  }
  await renderTo(path.join(OUT_DIR, "rift_lair_field.webp"), riftLairHexSvg(), HEX, HEX);
  await renderTo(path.join(OUT_DIR, "dungeon_gate_field.webp"), dungeonGateHexSvg(), HEX, HEX);
  console.log("Raid/Dungeon placeholder art build complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

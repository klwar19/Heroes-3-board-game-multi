/**
 * Build the painted Calamity Waves / Raid Boss / Dungeon art.
 *
 * ImageGen masters live in scripts/anime-art/raw/bosses. This script performs
 * deterministic project-side finishing only: crop, readable title plates,
 * ornate frame, health-layer pips, WebP encoding, and 512px map-object crops.
 *
 * Run: node scripts/build-raid-dungeon-art.mjs
 */

import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW_DIR = path.join(ROOT, "scripts", "anime-art", "raw", "bosses");
const OUT_DIR = path.join(ROOT, "public", "assets", "bosses");
const CARD_W = 743;
const CARD_H = 1040;
const HEX = 512;
const WEBP = { quality: 92, effort: 6 };

const BOSSES = [
  { id: "goblin_king", name: "GOBLIN KING", title: "Tyrant of the Warrens", layers: 3, accent: "#9adb4f" },
  { id: "colossal_titan", name: "COLOSSAL TITAN", title: "The Walking Calamity", layers: 5, accent: "#e0cfc5" },
  { id: "abyss_kraken", name: "ABYSS KRAKEN", title: "Terror of the Deep", layers: 4, accent: "#63dbe3" },
  { id: "calamity_dragon", name: "CALAMITY DRAGON", title: "Herald of the Rift", layers: 6, accent: "#ff8a3d" },
  { id: "avatar_of_erebos", name: "AVATAR OF EREBOS", title: "The God That Walks", layers: 7, accent: "#b779ff" },
  { id: "minotaur_of_the_depths", name: "MINOTAUR OF THE DEPTHS", title: "Warden of Floor 5", layers: 2, accent: "#e0a054" },
  { id: "floor_wyrm", name: "THE FLOOR WYRM", title: "Warden of Floor 10", layers: 2, accent: "#e5e2cf" },
  { id: "custom_boss", name: "CUSTOM BOSS", title: "Designer's Nightmare", layers: 4, accent: "#a8c4ec" },
  { id: "cyberdemon_prime", name: "CYBERDEMON PRIME", title: "Siege Lord of Hell", layers: 6, accent: "#ff6b35" },
  { id: "spider_overmind", name: "SPIDER OVERMIND", title: "Architect of the Invasion", layers: 5, accent: "#a9ff70" },
  { id: "doom_baron_warden", name: "BARON WARDEN", title: "Keeper of Infernal Floor 5", layers: 2, accent: "#8dff55", topPadding: 120 },
  { id: "doom_cyberdemon_tyrant", name: "CYBERDEMON TYRANT", title: "Keeper of Infernal Floor 10", layers: 3, accent: "#ff7a32" }
];

const MAP_OBJECTS = [
  "calamity_gate_classic",
  "calamity_gate_doom",
  "dungeon_gate_classic",
  "dungeon_gate_doom",
  "rift_lair_classic",
  "rift_lair_doom"
];

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function cornerFlourish(x, y, sx, sy) {
  return `<path d="M ${x} ${y + 70 * sy} Q ${x} ${y}, ${x + 70 * sx} ${y}
    M ${x} ${y + 44 * sy} Q ${x} ${y}, ${x + 44 * sx} ${y}"
    fill="none" stroke="#d7b45d" stroke-width="4" stroke-linecap="round"/>`;
}

function cardFinishSvg(boss) {
  const cx = CARD_W / 2;
  const pipWidth = 46;
  const pipGap = 14;
  const totalPipWidth = boss.layers * pipWidth + (boss.layers - 1) * pipGap;
  const pips = Array.from({ length: boss.layers }, (_, index) => {
    const x = cx - totalPipWidth / 2 + index * (pipWidth + pipGap);
    return `<rect x="${x}" y="928" width="${pipWidth}" height="19" rx="5"
      fill="${boss.accent}" stroke="#100b08" stroke-width="2"/>`;
  }).join("");
  const nameSize =
    boss.name.length >= 18 ? 32 : boss.name.length >= 15 ? 36 : boss.name.length >= 12 ? 42 : 48;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}">
    <defs>
      <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#050306" stop-opacity="0.92"/>
        <stop offset="22%" stop-color="#050306" stop-opacity="0.08"/>
        <stop offset="72%" stop-color="#050306" stop-opacity="0"/>
        <stop offset="100%" stop-color="#050306" stop-opacity="0.97"/>
      </linearGradient>
    </defs>
    <rect width="${CARD_W}" height="${CARD_H}" fill="url(#shade)"/>
    <rect x="18" y="18" width="${CARD_W - 36}" height="${CARD_H - 36}" fill="none" stroke="#d7b45d" stroke-width="6" rx="14"/>
    <rect x="34" y="34" width="${CARD_W - 68}" height="${CARD_H - 68}" fill="none" stroke="#d7b45d" stroke-width="2" rx="10" opacity="0.9"/>
    ${cornerFlourish(52, 52, 1, 1)}
    ${cornerFlourish(CARD_W - 52, 52, -1, 1)}
    ${cornerFlourish(52, CARD_H - 52, 1, -1)}
    ${cornerFlourish(CARD_W - 52, CARD_H - 52, -1, -1)}
    <rect x="72" y="72" width="${CARD_W - 144}" height="134" rx="14" fill="#070407" fill-opacity="0.78" stroke="#d7b45d" stroke-width="2"/>
    <text x="${cx}" y="137" font-family="Georgia, 'Times New Roman', serif" font-size="${nameSize}" font-weight="bold"
      fill="#fff3d0" text-anchor="middle" letter-spacing="2">${escapeXml(boss.name)}</text>
    <text x="${cx}" y="180" font-family="Georgia, serif" font-size="25" font-style="italic"
      fill="${boss.accent}" text-anchor="middle">${escapeXml(boss.title)}</text>
    <rect x="116" y="878" width="${CARD_W - 232}" height="93" rx="16" fill="#070407" fill-opacity="0.78" stroke="#d7b45d" stroke-width="1.5"/>
    <text x="${cx}" y="914" font-family="Georgia, serif" font-size="20" font-weight="bold"
      fill="#efe3c2" text-anchor="middle" letter-spacing="2">HEALTH LAYERS</text>
    ${pips}
  </svg>`);
}

async function renderBossCard(boss) {
  const input = path.join(RAW_DIR, `${boss.id}.png`);
  const output = path.join(OUT_DIR, `${boss.id}.webp`);
  let artwork = sharp(input);
  if (boss.topPadding) {
    const padded = await artwork
      .resize({ width: CARD_W })
      .extend({ top: boss.topPadding, bottom: 0, left: 0, right: 0, background: "#080507" })
      .toBuffer();
    artwork = sharp(padded)
      .extract({ left: 0, top: 0, width: CARD_W, height: CARD_H });
  } else {
    artwork = artwork.resize(CARD_W, CARD_H, { fit: "cover", position: "attention" });
  }
  await artwork
    .modulate({ saturation: 0.96, brightness: 0.92 })
    .composite([{ input: cardFinishSvg(boss), blend: "over" }])
    .webp(WEBP)
    .toFile(output);
  return output;
}

async function renderMapObject(id) {
  const output = path.join(OUT_DIR, `${id}.webp`);
  await sharp(path.join(RAW_DIR, `${id}.png`))
    .resize(HEX, HEX, { fit: "cover", position: "attention" })
    .modulate({ saturation: 1.02, brightness: 0.95 })
    .sharpen({ sigma: 0.6 })
    .webp(WEBP)
    .toFile(output);
  return output;
}

async function verify(filePath, width, height) {
  const meta = await sharp(filePath).metadata();
  if (meta.width !== width || meta.height !== height || meta.format !== "webp") {
    throw new Error(
      `${path.relative(ROOT, filePath)}: got ${meta.width}x${meta.height} ${meta.format}, wanted ${width}x${height} webp`
    );
  }
  console.log(`built ${path.relative(ROOT, filePath)} (${width}x${height})`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const boss of BOSSES) {
    const output = await renderBossCard(boss);
    await verify(output, CARD_W, CARD_H);
  }
  for (const id of MAP_OBJECTS) {
    const output = await renderMapObject(id);
    await verify(output, HEX, HEX);
  }

  // Compatibility aliases for snapshots/tests that still reference the first
  // release's unthemed names.
  await copyFile(
    path.join(OUT_DIR, "rift_lair_classic.webp"),
    path.join(OUT_DIR, "rift_lair_field.webp")
  );
  await copyFile(
    path.join(OUT_DIR, "dungeon_gate_classic.webp"),
    path.join(OUT_DIR, "dungeon_gate_field.webp")
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

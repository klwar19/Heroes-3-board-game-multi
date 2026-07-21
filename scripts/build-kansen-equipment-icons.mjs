#!/usr/bin/env node
/**
 * Build the 3 Azur Lane Naval Base "kansen" equipment INVENTORY ICONS
 * (512×512 webp) — the register line for the `azur_lane` faction (§3.13).
 *
 * DETERMINISTIC + idempotent: pure vector SVG composition via sharp, no RNG,
 * so re-running overwrites byte-identical outputs. Each icon is real NAVAL
 * iconography in the Azur Lane blue-white-gold chrome (deep-ocean navy rounded-
 * square base + a "white-glove navy" gold/white double frame), grade-tinted on
 * the outer stroke to match GRADE_STYLE in build-equipment-cards.mjs:
 *   I  silver  #c7ccd6   ·   II  gold  #e7b73c   ·   III  relic-blue  #6fa8ff
 *
 *   oxygen_torpedo (weapon I)  — a sleek purple-black torpedo at a dynamic
 *                                angle with wake lines + rising oxygen bubbles.
 *   repair_toolkit (armor II)  — an open steel toolkit with a crossed wrench +
 *                                spanner and a small gold anchor badge.
 *   sg_radar       (accessory III) — a radar dish with a luminous sweep arc and
 *                                blips over concentric range rings.
 *
 * Outputs (masters the card-face build picks up automatically from ICON_DIR):
 *   public/assets/anime/equipment/{oxygen_torpedo,repair_toolkit,sg_radar}.webp
 *
 * Run: node scripts/build-kansen-equipment-icons.mjs
 * Then: node scripts/build-equipment-cards.mjs   (builds the ornate card faces)
 */

import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ICON_DIR = path.join(ROOT, "public", "assets", "anime", "equipment");
const S = 512;
const WEBP = { quality: 92, effort: 6 };

/** Grade → outer-frame tint (the GRADE_STYLE ladder in build-equipment-cards.mjs). */
const GRADE_TINT = { I: "#c7ccd6", II: "#e7b73c", III: "#6fa8ff" };
const GRADE_ROMAN = { I: "I", II: "II", III: "III" };

const esc = (v) =>
  String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const f1 = (n) => Number(n).toFixed(1);
const f2 = (n) => Number(n).toFixed(2);

/** A compact stroked anchor emblem centred at (cx,cy) with half-height s. */
function anchor(cx, cy, s, stroke, sw) {
  const w = f2(sw ?? Math.max(1, s * 0.14));
  const top = cy - s;
  return `<g stroke="${stroke}" fill="none" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="${f1(cx)}" cy="${f1(top)}" r="${f2(s * 0.17)}"/>
    <line x1="${f1(cx)}" y1="${f1(top + s * 0.17)}" x2="${f1(cx)}" y2="${f1(cy + s * 0.86)}"/>
    <line x1="${f1(cx - s * 0.44)}" y1="${f1(top + s * 0.5)}" x2="${f1(cx + s * 0.44)}" y2="${f1(top + s * 0.5)}"/>
    <path d="M ${f1(cx - s * 0.64)} ${f1(cy + s * 0.28)} Q ${f1(cx - s * 0.64)} ${f1(cy + s * 0.9)} ${f1(cx)} ${f1(cy + s * 0.9)} Q ${f1(cx + s * 0.64)} ${f1(cy + s * 0.9)} ${f1(cx + s * 0.64)} ${f1(cy + s * 0.28)}"/>
    <line x1="${f1(cx - s * 0.64)}" y1="${f1(cy + s * 0.28)}" x2="${f1(cx - s * 0.86)}" y2="${f1(cy + s * 0.12)}"/>
    <line x1="${f1(cx + s * 0.64)}" y1="${f1(cy + s * 0.28)}" x2="${f1(cx + s * 0.86)}" y2="${f1(cy + s * 0.12)}"/>
  </g>`;
}

/** Shared deep-ocean navy base + grade-tinted "white-glove navy" double frame. */
function baseDefsAndFrame(grade, glyphLabel) {
  const tint = GRADE_TINT[grade] ?? "#c7ccd6";
  // faint bottom wake arcs (fixed, deterministic)
  let wake = "";
  for (let i = 0; i < 4; i++) {
    wake += `<ellipse cx="256" cy="472" rx="${f1(120 + i * 74)}" ry="${f1(58 + i * 34)}" fill="none" stroke="#bfe0ff" stroke-width="2.4" opacity="${f2(0.14 - i * 0.028)}"/>`;
  }
  // corner rivets (naval chrome)
  const rivets = [
    [58, 58], [454, 58], [58, 454], [454, 454]
  ]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5.5" fill="#eef4ff" opacity="0.55"/><circle cx="${x}" cy="${y}" r="5.5" fill="none" stroke="#0b1a2c" stroke-width="1.4" opacity="0.7"/>`)
    .join("");
  return {
    tint,
    defs: `<defs>
      <radialGradient id="navy" cx="50%" cy="40%" r="66%">
        <stop offset="0%" stop-color="#1c4c81"/>
        <stop offset="52%" stop-color="#0f2c50"/>
        <stop offset="100%" stop-color="#071628"/>
      </radialGradient>
      <radialGradient id="glow" cx="50%" cy="42%" r="58%">
        <stop offset="0%" stop-color="#3d7fc4" stop-opacity="0.62"/>
        <stop offset="60%" stop-color="#1a4a82" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="#071628" stop-opacity="0"/>
      </radialGradient>
    </defs>`,
    back: `<rect width="${S}" height="${S}" rx="46" fill="url(#navy)"/>
      <ellipse cx="256" cy="222" rx="232" ry="216" fill="url(#glow)"/>
      ${wake}`,
    // frame drawn LAST so the motif tucks under it
    frame: `${rivets}
      <rect x="14" y="14" width="484" height="484" rx="36" fill="none" stroke="${tint}" stroke-width="7" opacity="0.92"/>
      <rect x="25" y="25" width="462" height="462" rx="30" fill="none" stroke="#eef4ff" stroke-width="3" opacity="0.82"/>
      <rect x="31" y="31" width="450" height="450" rx="26" fill="none" stroke="#d9b45a" stroke-width="2" opacity="0.7"/>
      ${anchor(256, 460, 20, "#eaf3ff", 3)}
      <text x="256" y="497" text-anchor="middle" font-family="'Times New Roman','Liberation Serif',Georgia,serif" font-size="22" font-weight="700" letter-spacing="5" fill="${tint}" opacity="0.92">GRADE ${GRADE_ROMAN[grade] ?? grade} · ${esc(glyphLabel)}</text>`
  };
}

/** A sleek purple-black oxygen torpedo at a dynamic angle + wake + bubbles. */
function torpedoMotif() {
  // torpedo drawn horizontally then rotated to a dynamic diving angle
  const g = `<g transform="translate(250 236) rotate(-24)">
    <!-- trailing wake chevrons behind the tail (drawn first, under body) -->
    <g stroke="#bfe0ff" fill="none" stroke-linecap="round">
      <path d="M -232 0 Q -200 -20 -168 0" stroke-width="4" opacity="0.5"/>
      <path d="M -232 0 Q -196 22 -160 0" stroke-width="4" opacity="0.4"/>
      <path d="M -200 0 Q -172 -14 -144 0" stroke-width="3.5" opacity="0.6"/>
    </g>
    <!-- tail fins -->
    <polygon points="-158,-8 -196,-40 -150,-16" fill="#4a2c7a"/>
    <polygon points="-158,8 -196,40 -150,16" fill="#3a2160"/>
    <!-- propeller shaft -->
    <line x1="-152" y1="0" x2="-176" y2="0" stroke="#c9b7ff" stroke-width="5" stroke-linecap="round"/>
    <!-- main body capsule -->
    <rect x="-156" y="-32" width="266" height="64" rx="32" fill="url(#torpBody)"/>
    <!-- nose cone -->
    <path d="M 110 -32 Q 178 -22 190 0 Q 178 22 110 32 Z" fill="url(#torpNose)"/>
    <!-- body banding + rivet line -->
    <rect x="-30" y="-32" width="10" height="64" rx="3" fill="#120a20" opacity="0.65"/>
    <rect x="52" y="-32" width="8" height="64" rx="3" fill="#120a20" opacity="0.55"/>
    <line x1="-150" y1="-14" x2="150" y2="-18" stroke="#b98bff" stroke-width="3" opacity="0.7"/>
    <!-- violet gloss highlight -->
    <path d="M -140 -18 Q -20 -30 150 -22" fill="none" stroke="#e7d8ff" stroke-width="4" opacity="0.55" stroke-linecap="round"/>
    <!-- warhead ring -->
    <circle cx="150" cy="0" r="9" fill="#ffd67a" opacity="0.9" stroke="#7a5a10" stroke-width="2"/>
  </g>
  <!-- rising oxygen bubbles -->
  <g fill="#bfe6ff">
    <circle cx="132" cy="150" r="9" opacity="0.75"/>
    <circle cx="108" cy="192" r="6" opacity="0.6"/>
    <circle cx="150" cy="210" r="5" opacity="0.5"/>
    <circle cx="96" cy="146" r="4.5" opacity="0.5"/>
  </g>`;
  const defs = `<defs>
    <linearGradient id="torpBody" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5a3aa0"/>
      <stop offset="0.35" stop-color="#33205c"/>
      <stop offset="1" stop-color="#0c0714"/>
    </linearGradient>
    <linearGradient id="torpNose" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#3a2160"/>
      <stop offset="1" stop-color="#1a0f2c"/>
    </linearGradient>
  </defs>`;
  return { defs, motif: g };
}

/** An open steel toolkit: box + open lid + handle, crossed wrench & spanner, anchor badge. */
function toolkitMotif() {
  const g = `<g>
    <!-- open lid (angled up behind the box) -->
    <g transform="translate(256 176) rotate(-13)">
      <rect x="-150" y="-56" width="300" height="66" rx="12" fill="url(#steelLid)" stroke="#0c1626" stroke-width="3"/>
      <rect x="-150" y="-40" width="300" height="10" fill="#161d28" opacity="0.5"/>
      <rect x="-30" y="-56" width="60" height="14" rx="6" fill="#20293a"/>
    </g>
    <!-- carry handle -->
    <path d="M 214 150 Q 256 112 298 150" fill="none" stroke="#c7ccd6" stroke-width="9" stroke-linecap="round"/>
    <path d="M 214 150 Q 256 112 298 150" fill="none" stroke="#0c1626" stroke-width="3" stroke-linecap="round" opacity="0.5"/>
    <!-- crossed wrench + spanner tucked inside, behind the front wall -->
    <g transform="translate(256 246)">
      <!-- open-end spanner -->
      <g transform="rotate(34)" fill="#aeb6c4" stroke="#0c1626" stroke-width="2.5">
        <rect x="-118" y="-9" width="210" height="18" rx="9"/>
        <path d="M 92 -22 L 122 -22 L 132 -9 L 116 0 L 132 9 L 122 22 L 92 22 Z"/>
        <circle cx="-104" cy="0" r="17" fill="none" stroke-width="9"/>
      </g>
      <!-- pipe wrench -->
      <g transform="rotate(-32)" fill="#c7ccd6" stroke="#0c1626" stroke-width="2.5">
        <rect x="-116" y="-8" width="200" height="16" rx="8"/>
        <path d="M 84 -30 L 116 -22 L 120 2 L 96 20 L 78 6 L 84 -14 Z"/>
        <rect x="70" y="-28" width="34" height="12" rx="4"/>
      </g>
    </g>
    <!-- front wall of the box (over the tools) -->
    <path d="M 130 226 L 382 226 L 366 356 L 146 356 Z" fill="url(#steelBox)" stroke="#0c1626" stroke-width="4"/>
    <rect x="150" y="248" width="212" height="10" fill="#161d28" opacity="0.45"/>
    <!-- latch -->
    <rect x="240" y="220" width="32" height="20" rx="4" fill="#2a3547" stroke="#0c1626" stroke-width="2"/>
    <!-- gold anchor badge -->
    ${anchor(256, 322, 30, "#f2c85a", 6)}
    <circle cx="256" cy="300" r="46" fill="none" stroke="#f2c85a" stroke-width="3" opacity="0.5"/>
  </g>`;
  const defs = `<defs>
    <linearGradient id="steelBox" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6b7686"/>
      <stop offset="1" stop-color="#2b323e"/>
    </linearGradient>
    <linearGradient id="steelLid" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7c8798"/>
      <stop offset="1" stop-color="#3a4250"/>
    </linearGradient>
  </defs>`;
  return { defs, motif: g };
}

/** A radar dish with a luminous sweep arc + blips over concentric range rings. */
function radarMotif() {
  const cx = 256;
  const cy = 250;
  // concentric range rings
  let rings = "";
  for (const r of [66, 118, 168]) {
    rings += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#7fe0d0" stroke-width="2" opacity="0.28"/>`;
  }
  // cross graticule
  const grat = `<line x1="${cx - 176}" y1="${cy}" x2="${cx + 176}" y2="${cy}" stroke="#7fe0d0" stroke-width="1.5" opacity="0.18"/>
    <line x1="${cx}" y1="${cy - 176}" x2="${cx}" y2="${cy + 176}" stroke="#7fe0d0" stroke-width="1.5" opacity="0.18"/>`;
  // luminous sweep wedge (a pie slice), fixed angle
  const a0 = -95 * (Math.PI / 180);
  const a1 = -35 * (Math.PI / 180);
  const R = 172;
  const x0 = cx + R * Math.cos(a0);
  const y0 = cy + R * Math.sin(a0);
  const x1 = cx + R * Math.cos(a1);
  const y1 = cy + R * Math.sin(a1);
  const sweep = `<path d="M ${cx} ${cy} L ${f1(x0)} ${f1(y0)} A ${R} ${R} 0 0 1 ${f1(x1)} ${f1(y1)} Z" fill="url(#sweep)"/>
    <line x1="${cx}" y1="${cy}" x2="${f1(x1)}" y2="${f1(y1)}" stroke="#d6fff4" stroke-width="3.5" opacity="0.9" stroke-linecap="round"/>`;
  // blips
  const blips = `<circle cx="${f1(cx + 96 * Math.cos(-60 * Math.PI / 180))}" cy="${f1(cy + 96 * Math.sin(-60 * Math.PI / 180))}" r="7" fill="#eafff7"/>
    <circle cx="${f1(cx + 142 * Math.cos(-48 * Math.PI / 180))}" cy="${f1(cy + 142 * Math.sin(-48 * Math.PI / 180))}" r="5" fill="#aef2e2"/>
    <circle cx="${f1(cx + 58 * Math.cos(-78 * Math.PI / 180))}" cy="${f1(cy + 58 * Math.sin(-78 * Math.PI / 180))}" r="4.5" fill="#eafff7"/>`;
  // dish + mast (foreground, lower)
  const dish = `<g>
    <!-- tripod mast -->
    <g stroke="#c7ccd6" stroke-width="7" stroke-linecap="round">
      <line x1="256" y1="342" x2="220" y2="430"/>
      <line x1="256" y1="342" x2="292" y2="430"/>
      <line x1="256" y1="342" x2="256" y2="432"/>
    </g>
    <rect x="196" y="428" width="120" height="14" rx="6" fill="#2a3547" stroke="#0c1626" stroke-width="2"/>
    <!-- parabolic dish (tilted ellipse) -->
    <g transform="translate(256 300) rotate(-18)">
      <ellipse cx="0" cy="0" rx="94" ry="58" fill="url(#dishFace)" stroke="#0c1626" stroke-width="4"/>
      <ellipse cx="0" cy="0" rx="60" ry="36" fill="none" stroke="#3a5f7a" stroke-width="3" opacity="0.7"/>
      <ellipse cx="0" cy="0" rx="26" ry="15" fill="none" stroke="#3a5f7a" stroke-width="3" opacity="0.6"/>
      <!-- feed horn -->
      <line x1="0" y1="0" x2="74" y2="-42" stroke="#c7ccd6" stroke-width="5"/>
      <circle cx="74" cy="-42" r="10" fill="#f2c85a" stroke="#0c1626" stroke-width="2"/>
    </g>
  </g>`;
  const defs = `<defs>
    <radialGradient id="sweep" cx="0%" cy="100%" r="150%">
      <stop offset="0" stop-color="#aef7e6" stop-opacity="0.85"/>
      <stop offset="55%" stop-color="#59d3bb" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#59d3bb" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="dishFace" cx="42%" cy="38%" r="70%">
      <stop offset="0" stop-color="#dfe7f2"/>
      <stop offset="60%" stop-color="#9aa6b8"/>
      <stop offset="100%" stop-color="#4a5566"/>
    </radialGradient>
  </defs>`;
  return { defs, motif: `${rings}${grat}${sweep}${blips}${dish}` };
}

const ICONS = [
  { slug: "oxygen_torpedo", grade: "I", label: "TORPEDO", build: torpedoMotif },
  { slug: "repair_toolkit", grade: "II", label: "REPAIR", build: toolkitMotif },
  { slug: "sg_radar", grade: "III", label: "RADAR", build: radarMotif }
];

async function main() {
  await mkdir(ICON_DIR, { recursive: true });
  const rows = [];
  for (const icon of ICONS) {
    const { defs: baseDefs, back, frame } = baseDefsAndFrame(icon.grade, icon.label);
    const { defs: motifDefs, motif } = icon.build();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
      ${baseDefs}
      ${motifDefs}
      ${back}
      ${motif}
      ${frame}
    </svg>`;
    const outPath = path.join(ICON_DIR, `${icon.slug}.webp`);
    await sharp(Buffer.from(svg)).resize(S, S, { fit: "fill" }).webp(WEBP).toFile(outPath);
    const meta = await sharp(outPath).metadata();
    if (meta.width !== S || meta.height !== S) {
      throw new Error(`Dimension mismatch for ${icon.slug}: ${meta.width}x${meta.height}`);
    }
    const bytes = (await stat(outPath)).size;
    rows.push({ slug: icon.slug, grade: icon.grade, dims: `${meta.width}x${meta.height}`, bytes });
    console.log(`icon  ${icon.grade.padEnd(3)} ${icon.slug.padEnd(16)} ${meta.width}x${meta.height}  ${bytes} bytes`);
  }
  console.log(`DONE ${rows.length}/3 kansen equipment icons → public/assets/anime/equipment/`);
}

await main();

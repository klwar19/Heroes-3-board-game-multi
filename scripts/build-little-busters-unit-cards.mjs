#!/usr/bin/env node
/**
 * Little Busters town unit cards.
 *
 * Uses the real 743x1040 board-game blank frames and keeps generated art in the
 * art window only. Titles, stats, costs, type marks and rules are deterministic
 * SVG overlays, so the result follows the same hierarchy as the physical cards.
 *
 * Run: node scripts/build-little-busters-unit-cards.mjs [slug ...]
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW = path.join(ROOT, "scripts/anime-art/raw/little-busters/units");
const EDITABLE = path.join(ROOT, "scripts/anime-art/editable/little-busters/units");
const PUBLIC = path.join(ROOT, "public/assets/anime/units/little-busters");
const REVIEW = path.join(ROOT, "generated-session-art/little-busters/cards");
const W = 743;
const H = 1040;
const ART = { left: 173, top: 157, width: 509, height: 597 };
const WEBP = { quality: 90, effort: 6 };
const VALUABLE_ICON_DATA_URI = `data:image/png;base64,${(
  await sharp(path.join(ROOT, "public/assets/icons/resource-valuables.webp"))
    .resize(30, 36, { fit: "contain" })
    .png()
    .toBuffer()
).toString("base64")}`;

const CONTRACT = JSON.parse(
  await readFile(path.join(ROOT, "scripts/anime-art/little-busters-unit-card-contract.json"), "utf8")
);
const CARDS = CONTRACT.map((card) => ({
  slug: card.slug,
  name: card.name,
  tier: card.tier,
  type: card.type,
  art: card.art,
  stats: card.few.stats,
  packStats: card.pack.stats,
  cost: card.few.cost,
  packCost: card.pack.cost,
  few: card.few.text,
  pack: card.pack.text
}));

const esc = (s) => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function wrap(text, max = 54, limit = 6) {
  const lines = [];
  let line = "";
  for (const word of String(text).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, limit);
}

function costMarkup(cost, x) {
  if (!cost.valuables) return `<text x="${x}" y="813" class="cost">${cost.gold}</text>`;
  return `<text x="${x - 16}" y="813" class="cost">${cost.gold}</text>
    <image href="${VALUABLE_ICON_DATA_URI}" x="${x + 4}" y="783" width="30" height="36" aria-label="valuable crystal resource"/>
    <text x="${x + 45}" y="813" class="cost">${cost.valuables}</text>`;
}

function overlaySvg(card, side) {
  const isPack = side === "pack";
  const stats = { ...card.stats, ...(isPack ? card.packStats : {}) };
  const lines = wrap(card[side], card[side].length > 105 ? 57 : 52, 6);
  const fs = lines.length >= 5 ? 15 : lines.length === 4 ? 17 : 19;
  const lh = fs + 6;
  const top = 870 + Math.max(0, (120 - lines.length * lh) / 2);
  const titleFs = card.name.length > 20 ? 30 : card.name.length > 15 ? 34 : 40;
  const typeMark = card.type === "RANGED"
    ? `<g transform="translate(190 171)"><rect width="121" height="38" rx="8" fill="#17130dcc" stroke="#d9bd75" stroke-width="2"/><path d="M12 27Q26 5 40 27M26 6v25M20 23l6 8 6-8" fill="none" stroke="#f4e6b6" stroke-width="2.5" stroke-linecap="round"/><text x="50" y="24" class="kind">RANGED</text></g>`
    : `<g transform="translate(190 171)"><rect width="121" height="38" rx="8" fill="#17130dcc" stroke="#d9bd75" stroke-width="2"/><path d="M12 27c4-1 6-6 7-13l8-4 4 5-3 5 12 8c2 2 1 5-2 5H17c-4 0-6-3-5-6Z" fill="#f4e6b6"/><text x="50" y="24" class="kind">GROUND</text></g>`;
  const band = isPack
    ? `<rect x="61" y="764" width="622" height="66" fill="#372615" stroke="#b99759" stroke-width="3"/><text x="372" y="810" class="pack"># PACK</text>`
    : `${costMarkup(card.cost, 291)}${costMarkup(card.packCost, 582)}`;
  const ruleText = lines.map((line, i) => `<text x="371" y="${top + i * lh}" class="rule">${esc(line)}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><filter id="s"><feDropShadow dx="0" dy="1.5" stdDeviation="1.2" flood-color="#000" flood-opacity=".9"/></filter></defs>
  <style>
    .title,.stat,.cost,.pack,.rule{font-family:Georgia,'Times New Roman',serif;font-weight:700;fill:#f2e6b5;filter:url(#s)}
    .title{text-anchor:middle;font-size:${titleFs}px}.stat{text-anchor:middle;font-size:36px}.cost{text-anchor:middle;font-size:27px}
    .pack{text-anchor:middle;font-size:34px}.rule{text-anchor:middle;font-size:${fs}px;fill:#f6f0df}.kind{font-family:Arial,sans-serif;font-weight:700;font-size:12px;fill:#f4e6b6;letter-spacing:1px;filter:url(#s)}
  </style>
  <text x="371" y="111" class="title">${esc(card.name)}</text>
  <text x="118" y="286" class="stat">${stats.attack}</text>
  <text x="118" y="435" class="stat">${stats.defense}</text>
  <text x="118" y="584" class="stat">${stats.health}</text>
  <text x="118" y="732" class="stat">${stats.initiative}</text>
  ${typeMark}${band}${ruleText}
  </svg>`;
}

async function build(card, side) {
  const frameFile = path.join(ROOT, `public/assets/units-blank-${card.tier}.webp`);
  const frame = await sharp(frameFile).resize(W, H, { fit: "fill" }).png().toBuffer();
  const art = await sharp(path.join(RAW, card.art))
    .resize(ART.width, ART.height, { fit: "cover", position: "attention" })
    .png().toBuffer();
  const svg = overlaySvg(card, side);
  const overlay = await sharp(Buffer.from(svg)).png().toBuffer();
  const outName = `units-little-busters-${card.tier}-${card.slug}-${side}.webp`;
  const out = path.join(PUBLIC, outName);
  await sharp(frame).composite([{ input: art, left: ART.left, top: ART.top }, { input: overlay }]).webp(WEBP).toFile(out);
  const inner = svg.slice(svg.indexOf(">") + 1, svg.lastIndexOf("</svg>"));
  const editable = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <g id="frame"><image href="data:image/png;base64,${frame.toString("base64")}" width="${W}" height="${H}"/></g>
  <g id="illustration"><image href="data:image/png;base64,${art.toString("base64")}" x="${ART.left}" y="${ART.top}" width="${ART.width}" height="${ART.height}"/></g>
  <g id="editable-overlay">${inner}</g>
  </svg>`;
  await writeFile(path.join(EDITABLE, outName.replace(".webp", ".svg")), editable);
  await sharp(out).toFile(path.join(REVIEW, outName));
  return out;
}

await Promise.all([mkdir(EDITABLE, { recursive: true }), mkdir(PUBLIC, { recursive: true }), mkdir(REVIEW, { recursive: true })]);
const requested = new Set(process.argv.slice(2));
const selected = requested.size ? CARDS.filter((card) => requested.has(card.slug)) : CARDS;
const outputs = [];
for (const card of selected) for (const side of ["few", "pack"]) outputs.push(await build(card, side));

const thumbW = 223, thumbH = 312, gap = 8, cols = 7;
const thumbs = await Promise.all(outputs.map((file) => sharp(file).resize(thumbW, thumbH, { fit: "fill" }).png().toBuffer()));
await sharp({ create: { width: cols * thumbW + (cols + 1) * gap, height: 2 * thumbH + 3 * gap, channels: 4, background: "#111827" } })
  .composite(thumbs.map((input, i) => ({ input, left: gap + (i % cols) * (thumbW + gap), top: gap + Math.floor(i / cols) * (thumbH + gap) })))
  .webp({ quality: 90, effort: 6 })
  .toFile(path.join(REVIEW, "little-busters-unit-cards-contact-sheet.webp"));

for (const out of outputs) console.log(path.relative(ROOT, out));
console.log(path.relative(ROOT, path.join(REVIEW, "little-busters-unit-cards-contact-sheet.webp")));

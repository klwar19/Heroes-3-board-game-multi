#!/usr/bin/env node
/** Build the fourteen Bulwark Few/Pack unit-card faces from approved art. */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Raw masters live in the source-media family so a fresh checkout can restore
// them with `npm run media:pull -- --sources` before rebuilding the cards.
const RAW = path.join(ROOT, "generated-session-art/bulwark/cards/raw");
const OUT = path.join(ROOT, "public/assets");
const REVIEW = path.join(ROOT, "generated-session-art/bulwark/cards");
const W = 743;
const H = 1040;
const ART = { left: 173, top: 157, width: 509, height: 597 };
const WEBP = { quality: 85, effort: 6, smartSubsample: true };
const valuableIcon = `data:image/png;base64,${(
  await sharp(path.join(ROOT, "public/assets/icons/resource-valuables.webp"))
    .resize(30, 36, { fit: "contain" }).png().toBuffer()
).toString("base64")}`;

const cards = [
  { slug: "kobolds", name: "Kobolds", tier: "bronze", type: "GROUND", art: { few: "kobolds-few.png", pack: "kobolds-pack.png" },
    few: { stats: [2, 0, 3, 4], cost: { gold: 0 }, text: "" },
    pack: { stats: [2, 1, 4, 5], cost: { gold: 2 }, text: "At the beginning of each Resource round, gain 1 gold (Kobold Foreman)." } },
  { slug: "mountain_rams", name: "Mountain Rams", tier: "bronze", type: "GROUND", art: { few: "mountain_rams-few.png", pack: "mountain_rams-pack.png" },
    few: { stats: [2, 1, 4, 8], cost: { gold: 2 }, text: "" },
    pack: { stats: [2, 1, 5, 10], cost: { gold: 4 }, text: "Reduce damage from Spells by 1 (Argali)." } },
  { slug: "snow_elves", name: "Snow Elves", tier: "bronze", type: "RANGED", art: { few: "snow_elves-few.png", pack: "snow_elves-pack.png" },
    few: { stats: [3, 0, 4, 4], cost: { gold: 3 }, text: "No combat penalty for attacking an adjacent unit." },
    pack: { stats: [3, 1, 4, 5], cost: { gold: 5 }, text: "No adjacent-attack penalty. Attacks provoke no Retaliation (Steel Elf)." } },
  { slug: "yetis", name: "Yetis", tier: "silver", type: "GROUND", art: { few: "yetis-few.png", pack: "yetis-pack.png" },
    few: { stats: [3, 2, 4, 6], cost: { gold: 6 }, text: "" },
    pack: { stats: [3, 2, 5, 8], cost: { gold: 10 }, text: "At activation start, recover from all negative effects." } },
  { slug: "shamans", name: "Shamans", tier: "silver", type: "RANGED", art: { few: "shamans-few.png", pack: "shamans-pack.png" },
    few: { stats: [3, 0, 5, 5], cost: { gold: 7 }, text: "+1 Defense against ranged attackers (Air Shield)." },
    pack: { stats: [3, 1, 6, 6], cost: { gold: 11 }, text: "+1 Defense vs ranged. After attacking, target gets −2 Initiative next round (Freezing Shot)." } },
  { slug: "mammoths", name: "Mammoths", tier: "golden", type: "GROUND", art: { few: "mammoths-few.png", pack: "mammoths-pack.png" },
    few: { stats: [5, 2, 7, 5], cost: { gold: 12 }, text: "" },
    pack: { stats: [5, 2, 8, 6], cost: { gold: 20, valuables: 1 }, text: "+1 Defense while defending (War Mammoth)." } },
  { slug: "jotunns", name: "Jotunns", tier: "golden", type: "GROUND", art: { few: "jotunns-few.png", pack: "jotunns-pack.png" },
    few: { stats: [5, 3, 8, 7], cost: { gold: 18, valuables: 1 }, text: "" },
    pack: { stats: [6, 3, 9, 9], cost: { gold: 32, valuables: 2 }, text: "At activation start, may teleport one of your other units to an empty space, then act normally." } },
];

const esc = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function wrap(text, max = 52) {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/u).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && next.length > max) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function costMarkup(cost, x) {
  if (!cost.valuables) return `<text x="${x}" y="813" class="cost">${cost.gold}</text>`;
  return `<text x="${x - 16}" y="813" class="cost">${cost.gold}</text>
    <image href="${valuableIcon}" x="${x + 4}" y="783" width="30" height="36"/>
    <text x="${x + 45}" y="813" class="cost">${cost.valuables}</text>`;
}

function typeBadge(type) {
  const symbol = type === "RANGED"
    ? '<path d="M12 27Q26 5 40 27M26 6v25M20 23l6 8 6-8" fill="none" stroke="#f4e6b6" stroke-width="2.5" stroke-linecap="round"/>'
    : '<path d="M12 27c4-1 6-6 7-13l8-4 4 5-3 5 12 8c2 2 1 5-2 5H17c-4 0-6-3-5-6Z" fill="#f4e6b6"/>';
  return `<g transform="translate(190 171)"><rect width="121" height="38" rx="8" fill="#17130dcc" stroke="#d9bd75" stroke-width="2"/>${symbol}<text x="50" y="24" class="kind">${type}</text></g>`;
}

function overlay(card, side) {
  const face = card[side];
  const lines = wrap(face.text);
  const fs = lines.length >= 4 ? 17 : 19;
  const lh = fs + 7;
  const top = 880 + Math.max(0, (102 - lines.length * lh) / 2);
  const titleFs = card.name.length > 12 ? 34 : 40;
  const band = side === "pack"
    ? '<rect x="61" y="764" width="622" height="66" fill="#372615" stroke="#b99759" stroke-width="3"/><text x="372" y="810" class="pack"># PACK</text>'
    : `${costMarkup(card.few.cost, 291)}${costMarkup(card.pack.cost, 582)}`;
  const rules = lines.map((line, i) => `<text x="371" y="${top + i * lh}" class="rule">${esc(line)}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><filter id="s"><feDropShadow dx="0" dy="1.5" stdDeviation="1.2" flood-color="#000" flood-opacity=".9"/></filter></defs><style>
  .title,.stat,.cost,.pack,.rule{font-family:Georgia,'Times New Roman',serif;font-weight:700;fill:#f2e6b5;filter:url(#s)}
  .title{text-anchor:middle;font-size:${titleFs}px}.stat{text-anchor:middle;font-size:36px}.cost{text-anchor:middle;font-size:27px}.pack{text-anchor:middle;font-size:34px}.rule{text-anchor:middle;font-size:${fs}px;fill:#f6f0df}.kind{font-family:Arial,sans-serif;font-weight:700;font-size:12px;fill:#f4e6b6;letter-spacing:1px;filter:url(#s)}</style>
  <text x="371" y="111" class="title">${esc(card.name)}</text>
  ${face.stats.map((n, i) => `<text x="118" y="${[286, 435, 584, 732][i]}" class="stat">${n}</text>`).join("")}
  ${typeBadge(card.type)}${band}${rules}</svg>`;
}

async function artFor(card, side) {
  const position = card.slug === "snow_elves" || card.slug === "mountain_rams" ? "north" : "attention";
  return sharp(path.join(RAW, card.art[side]))
    .resize(ART.width, ART.height, { fit: "cover", position })
    .png().toBuffer();
}

async function build(card, side) {
  const frame = await sharp(path.join(OUT, `units-blank-${card.tier}.webp`)).resize(W, H, { fit: "fill" }).png().toBuffer();
  const art = await artFor(card, side);
  const svg = Buffer.from(overlay(card, side));
  const output = path.join(OUT, `units-bulwark-${card.tier}-${card.slug}-${side}.webp`);
  await sharp(frame).composite([{ input: art, left: ART.left, top: ART.top }, { input: svg }]).webp(WEBP).toFile(output);
  return output;
}

await mkdir(REVIEW, { recursive: true });
const outputs = [];
for (const card of cards) for (const side of ["few", "pack"]) outputs.push(await build(card, side));
const thumbW = 223, thumbH = 312, gap = 8, cols = 7;
const thumbs = await Promise.all(outputs.map((file) => sharp(file).resize(thumbW, thumbH, { fit: "fill" }).png().toBuffer()));
const contact = path.join(REVIEW, "bulwark-unit-cards-contact-sheet.webp");
await sharp({ create: { width: cols * thumbW + (cols + 1) * gap, height: 2 * thumbH + 3 * gap, channels: 4, background: "#111827" } })
  .composite(thumbs.map((input, i) => ({ input, left: gap + (i % cols) * (thumbW + gap), top: gap + Math.floor(i / cols) * (thumbH + gap) })))
  .webp(WEBP).toFile(contact);
for (const file of outputs) console.log(path.relative(ROOT, file));
console.log(path.relative(ROOT, contact));

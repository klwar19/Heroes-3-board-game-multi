#!/usr/bin/env node
/**
 * Deterministic Monster Girl Quest: Paradox unit-card compositor.
 *
 * Illustration masters are intentionally not supplied by this script. Put the
 * 58 approved, frame-free masters named by mgq-unit-card-contract.json beneath
 * scripts/anime-art/raw/mgq/units/, then run:
 *
 *   node scripts/build-mgq-unit-cards.mjs [slug ...]
 *   node scripts/build-mgq-unit-cards.mjs --check-contract
 *   node scripts/build-mgq-unit-cards.mjs --list-masters
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACT_PATH = path.join(ROOT, "scripts/anime-art/mgq-unit-card-contract.json");
const REFERENCE_PATH = path.join(ROOT, "scripts/anime-art/mgq-reference-manifest.json");
const EDITABLE = path.join(ROOT, "scripts/anime-art/editable/mgq/units");
const REVIEW = path.join(ROOT, "generated-session-art/mgq/cards");
// Match the repository's compression band for text-bearing card faces. Keeping
// this at the publish quality avoids a second lossy recompression pass whenever
// a balance edit rebuilds a card.
const WEBP = { quality: 85, effort: 6, smartSubsample: true };
const ACTIONS = new Set(["--check-contract", "--list-masters"]);

const contract = JSON.parse(await readFile(CONTRACT_PATH, "utf8"));
const references = JSON.parse(await readFile(REFERENCE_PATH, "utf8"));
const { width: W, height: H, artWindow: ART } = contract.layout;

function insideRoot(relative, label) {
  if (path.isAbsolute(relative)) throw new Error(`${label} must be repository-relative: ${relative}`);
  const resolved = path.resolve(ROOT, relative);
  const prefix = ROOT.endsWith(path.sep) ? ROOT : `${ROOT}${path.sep}`;
  if (!resolved.startsWith(prefix)) throw new Error(`${label} escapes the repository: ${relative}`);
  return resolved;
}

function expectedOutput(card, side) {
  return `public/assets/anime/units/mgq/units-mgq-${card.tier}-${card.assetSlug ?? card.slug}-${side}.webp`;
}

function validateContract() {
  const errors = [];
  const cards = contract.cards ?? [];
  const referenceIds = new Set((references.references ?? []).map((entry) => entry.id));
  const ids = new Set();
  const slugs = new Set();
  const outputs = new Set();
  const tiers = new Set(["bronze", "silver", "golden"]);
  const types = new Set(["GROUND", "RANGED", "FLYING"]);

  if (contract.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (contract.faction !== "mgq") errors.push("faction must be mgq");
  if (cards.length !== 29) errors.push(`expected 29 cards, found ${cards.length}`);
  if (W !== 743 || H !== 1040) errors.push(`card layout must be 743x1040, found ${W}x${H}`);
  if (JSON.stringify(ART) !== JSON.stringify({ left: 173, top: 157, width: 509, height: 597 })) {
    errors.push("art window must match the physical 743x1040 unit-card frame");
  }

  for (const card of cards) {
    if (ids.has(card.id)) errors.push(`duplicate id ${card.id}`);
    if (slugs.has(card.slug)) errors.push(`duplicate slug ${card.slug}`);
    ids.add(card.id);
    slugs.add(card.slug);
    if (card.id !== `mgq.${card.slug}`) errors.push(`${card.slug}: id must be mgq.${card.slug}`);
    if (!tiers.has(card.tier)) errors.push(`${card.slug}: invalid tier ${card.tier}`);
    if (!types.has(card.type)) errors.push(`${card.slug}: invalid type ${card.type}`);
    if (!Array.isArray(card.referenceIds) || card.referenceIds.length === 0) errors.push(`${card.slug}: no referenceIds`);
    for (const referenceId of card.referenceIds ?? []) {
      if (!referenceIds.has(referenceId)) errors.push(`${card.slug}: unknown reference ${referenceId}`);
    }
    for (const side of ["few", "pack"]) {
      const face = card[side];
      if (!face?.stats || !face?.cost || !Array.isArray(face.abilities) || !face.text) {
        errors.push(`${card.slug}/${side}: incomplete face contract`);
      }
      if (card.output?.[side] !== expectedOutput(card, side)) {
        errors.push(`${card.slug}/${side}: runtime output does not match the MGQ naming convention`);
      }
      const master = path.join(contract.masterRoot, card.art?.[side] ?? "");
      try { insideRoot(master, `${card.slug}/${side} master`); } catch (error) { errors.push(error.message); }
      const output = card.output?.[side] ?? "";
      if (outputs.has(output)) errors.push(`duplicate output ${output}`);
      outputs.add(output);
    }
  }
  if (errors.length) throw new Error(`Invalid MGQ unit-card contract:\n- ${errors.join("\n- ")}`);
  return { cards: cards.length, faces: cards.length * 2, references: referenceIds.size };
}

function esc(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function wrap(text, max = 55, limit = 6) {
  const lines = [];
  let line = "";
  for (const word of String(text).split(/\s+/u)) {
    const next = line ? `${line} ${word}` : word;
    if (line && next.length > max) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  if (lines.length > limit) throw new Error(`Rules text exceeds ${limit} lines: ${text}`);
  return lines;
}

const resourceIconDataUris = new Map();
async function resourceIcon(kind) {
  if (!resourceIconDataUris.has(kind)) {
    const source = kind === "buildingMaterials"
      ? "public/assets/glyphs/building_materials.svg"
      : "public/assets/icons/resource-valuables.webp";
    resourceIconDataUris.set(kind, `data:image/png;base64,${(
      await sharp(path.join(ROOT, source))
        .resize(30, 36, { fit: "contain" }).png().toBuffer()
    ).toString("base64")}`);
  }
  return resourceIconDataUris.get(kind);
}

function costMarkup(cost, x, icons) {
  const resource = cost.buildingMaterials ? "buildingMaterials" : cost.valuables ? "valuables" : null;
  if (!resource) return `<text x="${x}" y="813" class="cost">${cost.gold}</text>`;
  const amount = cost[resource];
  return `<text x="${x - 16}" y="813" class="cost">${cost.gold}</text>
    <image href="${icons[resource]}" x="${x + 4}" y="783" width="30" height="36"/>
    <text x="${x + 45}" y="813" class="cost">${amount}</text>`;
}

function typeBadge(type) {
  const symbol = type === "RANGED"
    ? '<path d="M12 27Q26 5 40 27M26 6v25M20 23l6 8 6-8" fill="none" stroke="#f4e6b6" stroke-width="2.5" stroke-linecap="round"/>'
    : type === "FLYING"
      ? '<path d="M11 28c8-18 19-20 29-16-7 2-12 7-14 15 6-6 12-8 18-7-8 4-13 9-18 14Z" fill="#f4e6b6"/>'
      : '<path d="M12 27c4-1 6-6 7-13l8-4 4 5-3 5 12 8c2 2 1 5-2 5H17c-4 0-6-3-5-6Z" fill="#f4e6b6"/>';
  return `<g transform="translate(190 171)"><rect width="121" height="38" rx="8" fill="#17130dcc" stroke="#d9bd75" stroke-width="2"/>${symbol}<text x="50" y="24" class="kind">${type}</text></g>`;
}

async function overlaySvg(card, side) {
  const face = card[side];
  const lines = wrap(face.text, face.text.length > 105 ? 57 : 52, 6);
  const fs = lines.length >= 5 ? 15 : lines.length === 4 ? 17 : 19;
  const lineHeight = fs + 6;
  const top = 870 + Math.max(0, (120 - lines.length * lineHeight) / 2);
  const titleFs = card.name.length > 22 ? 29 : card.name.length > 16 ? 34 : 40;
  const icons = {
    valuables: await resourceIcon("valuables"),
    buildingMaterials: await resourceIcon("buildingMaterials")
  };
  const band = side === "pack"
    ? '<rect x="61" y="764" width="622" height="66" fill="#372615" stroke="#b99759" stroke-width="3"/><text x="372" y="810" class="pack"># PACK</text>'
    : `${costMarkup(card.few.cost, 291, icons)}${costMarkup(card.pack.cost, 582, icons)}`;
  const rules = lines.map((line, index) => `<text x="371" y="${top + index * lineHeight}" class="rule">${esc(line)}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <metadata data-layout="mgq-unit-card-v1" data-unit="${esc(card.id)}" data-side="${side}" data-source="scripts/anime-art/mgq-unit-card-contract.json"/>
  <defs><filter id="s"><feDropShadow dx="0" dy="1.5" stdDeviation="1.2" flood-color="#000" flood-opacity=".9"/></filter></defs>
  <style>
    .title,.stat,.cost,.pack,.rule{font-family:Georgia,'Times New Roman',serif;font-weight:700;fill:#f2e6b5;filter:url(#s)}
    .title{text-anchor:middle;font-size:${titleFs}px}.stat{text-anchor:middle;font-size:36px}.cost{text-anchor:middle;font-size:27px}
    .pack{text-anchor:middle;font-size:34px}.rule{text-anchor:middle;font-size:${fs}px;fill:#f6f0df}.kind{font-family:Arial,sans-serif;font-weight:700;font-size:12px;fill:#f4e6b6;letter-spacing:1px;filter:url(#s)}
  </style>
  <text x="371" y="111" class="title">${esc(card.name)}</text>
  <text x="118" y="286" class="stat">${face.stats.attack}</text>
  <text x="118" y="435" class="stat">${face.stats.defense}</text>
  <text x="118" y="584" class="stat">${face.stats.health}</text>
  <text x="118" y="732" class="stat">${face.stats.initiative}</text>
  ${typeBadge(card.type)}${band}${rules}
  </svg>`;
}

async function preflight(cards) {
  const missing = [];
  const invalid = [];
  for (const card of cards) for (const side of ["few", "pack"]) {
    const relative = path.join(contract.masterRoot, card.art[side]);
    const file = insideRoot(relative, `${card.slug}/${side} master`);
    if (!existsSync(file)) { missing.push(relative.replaceAll("\\", "/")); continue; }
    try {
      const meta = await sharp(file).metadata();
      if (!meta.width || !meta.height || meta.width < ART.width || meta.height < ART.height) {
        invalid.push(`${relative} must be at least ${ART.width}x${ART.height}`);
      }
    } catch (error) {
      invalid.push(`${relative}: ${error.message}`);
    }
  }
  if (missing.length || invalid.length) {
    const details = [
      ...(missing.length ? [`Missing ${missing.length} approved master(s):`, ...missing.map((item) => `  ${item}`)] : []),
      ...(invalid.length ? [`Invalid ${invalid.length} master(s):`, ...invalid.map((item) => `  ${item}`)] : [])
    ];
    throw new Error(details.join("\n"));
  }
}

async function build(card, side) {
  const frameFile = insideRoot(contract.layout.frames[card.tier], `${card.tier} frame`);
  const masterFile = insideRoot(path.join(contract.masterRoot, card.art[side]), `${card.slug}/${side} master`);
  const outputFile = insideRoot(card.output[side], `${card.slug}/${side} output`);
  const frame = await sharp(frameFile).resize(W, H, { fit: "fill" }).png().toBuffer();
  const art = await sharp(masterFile)
    .resize(ART.width, ART.height, { fit: "cover", position: "attention" })
    .png().toBuffer();
  const svg = await overlaySvg(card, side);
  const overlay = await sharp(Buffer.from(svg)).png().toBuffer();
  await mkdir(path.dirname(outputFile), { recursive: true });
  await sharp(frame)
    .composite([{ input: art, left: ART.left, top: ART.top }, { input: overlay }])
    .webp(WEBP)
    .toFile(outputFile);

  const editableName = path.basename(outputFile, ".webp") + ".svg";
  const inner = svg.slice(svg.indexOf(">") + 1, svg.lastIndexOf("</svg>"));
  const editable = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <g id="frame"><image href="data:image/png;base64,${frame.toString("base64")}" width="${W}" height="${H}"/></g>
  <g id="illustration"><image href="data:image/png;base64,${art.toString("base64")}" x="${ART.left}" y="${ART.top}" width="${ART.width}" height="${ART.height}"/></g>
  <g id="editable-overlay">${inner}</g>
  </svg>`;
  await mkdir(EDITABLE, { recursive: true });
  await writeFile(path.join(EDITABLE, editableName), editable);
  return outputFile;
}

async function contactSheet(outputs) {
  const thumbW = 223, thumbH = 312, gap = 8, cols = 7;
  const rows = Math.ceil(outputs.length / cols);
  const thumbs = await Promise.all(outputs.map((file) => sharp(file).resize(thumbW, thumbH, { fit: "fill" }).png().toBuffer()));
  await mkdir(REVIEW, { recursive: true });
  const output = path.join(REVIEW, "mgq-unit-cards-contact-sheet.webp");
  await sharp({ create: { width: cols * thumbW + (cols + 1) * gap, height: rows * thumbH + (rows + 1) * gap, channels: 4, background: "#111827" } })
    .composite(thumbs.map((input, index) => ({ input, left: gap + (index % cols) * (thumbW + gap), top: gap + Math.floor(index / cols) * (thumbH + gap) })))
    .webp(WEBP)
    .toFile(output);
  return output;
}

const summary = validateContract();
const args = process.argv.slice(2);
if (args.includes("--check-contract")) {
  console.log(`MGQ unit-card contract OK: ${summary.cards} cards / ${summary.faces} faces.`);
  process.exit(0);
}
if (args.includes("--list-masters")) {
  for (const card of contract.cards) for (const side of ["few", "pack"]) {
    console.log(path.join(contract.masterRoot, card.art[side]).replaceAll("\\", "/"));
  }
  process.exit(0);
}
const requested = new Set(args.filter((arg) => !ACTIONS.has(arg)));
const unknown = [...requested].filter((slug) => !contract.cards.some((card) => card.slug === slug));
if (unknown.length) throw new Error(`Unknown MGQ unit slug(s): ${unknown.join(", ")}`);
const selected = requested.size ? contract.cards.filter((card) => requested.has(card.slug)) : contract.cards;
await preflight(selected);
const outputs = [];
for (const card of selected) for (const side of ["few", "pack"]) outputs.push(await build(card, side));
const sheet = await contactSheet(outputs);
for (const output of outputs) console.log(path.relative(ROOT, output));
console.log(path.relative(ROOT, sheet));

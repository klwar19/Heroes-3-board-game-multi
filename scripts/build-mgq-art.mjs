#!/usr/bin/env node
/**
 * Deterministic MGQ production compositor for every non-unit runtime asset.
 *
 * This script never creates illustration masters. It validates the explicit
 * paths in mgq-art-contract.json before writing anything, then crops, masks and
 * frames approved masters to the existing game dimensions.
 *
 *   node scripts/build-mgq-art.mjs [town tile heroes commander equipment icons]
 *   node scripts/build-mgq-art.mjs --check-contract
 *   node scripts/build-mgq-art.mjs --list-masters
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACT_PATH = path.join(ROOT, "scripts/anime-art/mgq-art-contract.json");
const REFERENCE_PATH = path.join(ROOT, "scripts/anime-art/mgq-reference-manifest.json");
const SESSION = path.join(ROOT, "generated-session-art/mgq");
const WEBP = { quality: 90, effort: 6 };
const GROUPS = new Set(["town", "tile", "heroes", "commander", "equipment", "icons"]);

const contract = JSON.parse(await readFile(CONTRACT_PATH, "utf8"));
const references = JSON.parse(await readFile(REFERENCE_PATH, "utf8"));

function insideRoot(relative, label) {
  if (path.isAbsolute(relative)) throw new Error(`${label} must be repository-relative: ${relative}`);
  const resolved = path.resolve(ROOT, relative);
  const prefix = ROOT.endsWith(path.sep) ? ROOT : `${ROOT}${path.sep}`;
  if (!resolved.startsWith(prefix)) throw new Error(`${label} escapes the repository: ${relative}`);
  return resolved;
}

function allAssets() {
  return [
    { group: "town", id: "town-empty", master: contract.town.emptyMaster, output: contract.town.emptyOutput, referenceIds: contract.town.referenceIds, minimum: [1024, 350] },
    { group: "town", id: "town-full", master: contract.town.fullMaster, output: contract.town.fullOutput, referenceIds: contract.town.referenceIds, minimum: [1024, 350] },
    { group: "tile", id: "starting-tile", ...contract.tile, minimum: [768, 740] },
    ...contract.heroes.map((asset) => ({ group: "heroes", ...asset, minimum: [768, 1024] })),
    { group: "commander", ...contract.commander, minimum: [504, 658] },
    ...contract.equipment.map((asset) => ({ group: "equipment", ...asset, output: asset.iconOutput, minimum: [512, 512] })),
    ...contract.icons.map((asset) => ({ group: "icons", ...asset, minimum: asset.kind === "specialty" ? [256, 256] : [512, 512] }))
  ];
}

function validateContract() {
  const errors = [];
  const referenceIds = new Set((references.references ?? []).map((entry) => entry.id));
  const masters = new Set();
  const outputs = new Set();
  const assets = allAssets();
  const expectedLayouts = {
    townPanorama: [2044, 701], townIcon: [174, 137], startingTile: [1024, 985],
    hero: [1086, 1448], commander: [743, 1040], equipmentIcon: [512, 512],
    equipmentCard: [743, 1040], icon: [512, 512], specialtyIcon: [256, 256]
  };

  if (contract.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (contract.faction !== "mgq") errors.push("faction must be mgq");
  if (contract.heroes?.length !== 5) errors.push(`expected 5 heroes, found ${contract.heroes?.length ?? 0}`);
  if (contract.equipment?.length !== 3) errors.push(`expected 3 equipment items, found ${contract.equipment?.length ?? 0}`);
  if (contract.icons?.length !== 21) errors.push(`expected 21 functional icons, found ${contract.icons?.length ?? 0}`);
  if (contract.town?.bars?.length !== 7) errors.push(`expected 7 town bars, found ${contract.town?.bars?.length ?? 0}`);
  if ((contract.layouts.townPanorama?.barWidths ?? []).reduce((sum, width) => sum + width, 0) !== 2044) {
    errors.push("the seven town bar widths must total 2044 pixels");
  }
  for (const [key, dimensions] of Object.entries(expectedLayouts)) {
    const layout = contract.layouts[key];
    if (layout?.width !== dimensions[0] || layout?.height !== dimensions[1]) {
      errors.push(`${key} must be ${dimensions[0]}x${dimensions[1]}`);
    }
  }
  for (const asset of assets) {
    try { insideRoot(asset.master, `${asset.id} master`); } catch (error) { errors.push(error.message); }
    if (masters.has(asset.master)) errors.push(`duplicate master ${asset.master}`);
    masters.add(asset.master);
    const assetOutputs = [...new Set([asset.output, asset.iconOutput, asset.cardOutput].filter(Boolean))];
    for (const output of assetOutputs) {
      try { insideRoot(output, `${asset.id} output`); } catch (error) { errors.push(error.message); }
      if (outputs.has(output)) errors.push(`duplicate output ${output}`);
      outputs.add(output);
    }
    if (!Array.isArray(asset.referenceIds)) errors.push(`${asset.id}: referenceIds must be explicit`);
    for (const referenceId of asset.referenceIds ?? []) {
      if (!referenceIds.has(referenceId)) errors.push(`${asset.id}: unknown reference ${referenceId}`);
    }
  }
  for (const bar of contract.town.bars ?? []) {
    if (bar.output !== `public/assets/town-board/mgq-bar-${bar.index}.webp`) errors.push(`bar ${bar.index}: invalid runtime output`);
    for (const referenceId of bar.referenceIds ?? []) {
      if (!referenceIds.has(referenceId)) errors.push(`bar ${bar.index}: unknown reference ${referenceId}`);
    }
  }
  if (errors.length) throw new Error(`Invalid MGQ art contract:\n- ${errors.join("\n- ")}`);
  return { assets: assets.length, outputs: outputs.size, references: referenceIds.size };
}

async function preflight(groups) {
  const selected = allAssets().filter((asset) => groups.has(asset.group));
  const missing = [];
  const invalid = [];
  for (const asset of selected) {
    const file = insideRoot(asset.master, `${asset.id} master`);
    if (!existsSync(file)) { missing.push(asset.master); continue; }
    try {
      const meta = await sharp(file).metadata();
      if (!meta.width || !meta.height || meta.width < asset.minimum[0] || meta.height < asset.minimum[1]) {
        invalid.push(`${asset.master} must be at least ${asset.minimum[0]}x${asset.minimum[1]}`);
      }
    } catch (error) {
      invalid.push(`${asset.master}: ${error.message}`);
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

async function outWebp(master, output, width, height, options = {}) {
  const source = insideRoot(master, "master");
  const destination = insideRoot(output, "output");
  await mkdir(path.dirname(destination), { recursive: true });
  await sharp(source)
    .resize(width, height, {
      fit: options.fit ?? "cover",
      position: options.position ?? "attention",
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .webp({ ...WEBP, quality: options.quality ?? WEBP.quality })
    .toFile(destination);
  return destination;
}

async function reviewSheet(files, name, width = 220, height = 250, columns = 6) {
  const gap = 8;
  const rows = Math.ceil(files.length / columns);
  const thumbs = await Promise.all(files.map((file) => sharp(file).resize(width, height, { fit: "contain", background: "#151d2d" }).png().toBuffer()));
  const output = path.join(SESSION, name);
  await mkdir(path.dirname(output), { recursive: true });
  await sharp({ create: { width: columns * width + (columns + 1) * gap, height: rows * height + (rows + 1) * gap, channels: 4, background: "#101827" } })
    .composite(thumbs.map((input, index) => ({ input, left: gap + (index % columns) * (width + gap), top: gap + Math.floor(index / columns) * (height + gap) })))
    .webp(WEBP)
    .toFile(output);
  return output;
}

async function buildTown() {
  const layout = contract.layouts.townPanorama;
  const empty = await outWebp(contract.town.emptyMaster, contract.town.emptyOutput, layout.width, layout.height, { quality: 92 });
  const full = await outWebp(contract.town.fullMaster, contract.town.fullOutput, layout.width, layout.height, { quality: 92 });
  const fullPng = await sharp(full).png().toBuffer();
  const bars = [];
  let left = 0;
  for (let index = 0; index < contract.town.bars.length; index += 1) {
    const width = layout.barWidths[index];
    const output = insideRoot(contract.town.bars[index].output, `town bar ${index + 1}`);
    await mkdir(path.dirname(output), { recursive: true });
    await sharp(fullPng).extract({ left, top: 0, width, height: layout.height }).webp(WEBP).toFile(output);
    bars.push(output);
    left += width;
  }

  const fullRatioCrop = Math.round(layout.height * (contract.layouts.townIcon.width / contract.layouts.townIcon.height));
  const townIcon = insideRoot(contract.town.iconOutput, "town icon");
  await sharp(full)
    .extract({ left: Math.round((layout.width - fullRatioCrop) / 2), top: 0, width: fullRatioCrop, height: layout.height })
    .resize(contract.layouts.townIcon.width, contract.layouts.townIcon.height, { fit: "fill" })
    .webp(WEBP)
    .toFile(townIcon);

  const barInputs = await Promise.all(bars.map((file) => sharp(file).png().toBuffer()));
  const stages = [];
  for (let count = 0; count <= bars.length; count += 1) {
    let tileLeft = 0;
    const layers = barInputs.slice(0, count).map((input, index) => {
      const layer = { input, left: tileLeft, top: 0 };
      tileLeft += layout.barWidths[index];
      return layer;
    });
    const progressive = await sharp(empty).composite(layers).png().toBuffer();
    stages.push(await sharp(progressive).resize(410, 141, { fit: "fill" }).png().toBuffer());
  }
  const progress = path.join(SESSION, "mgq-town-progress-0-to-7.webp");
  await mkdir(path.dirname(progress), { recursive: true });
  await sharp({ create: { width: 4 * 410 + 5 * 8, height: 2 * 141 + 3 * 8, channels: 4, background: "#101827" } })
    .composite(stages.map((input, index) => ({ input, left: 8 + (index % 4) * 418, top: 8 + Math.floor(index / 4) * 149 })))
    .webp(WEBP)
    .toFile(progress);
  return [empty, full, townIcon, ...bars, progress];
}

async function buildTile() {
  const layout = contract.layouts.startingTile;
  const rgb = await sharp(insideRoot(contract.tile.master, "starting tile master"))
    .trim({ background: "#ffffff", threshold: 18 })
    .resize(layout.width, layout.height, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const alpha = await sharp(insideRoot(layout.alphaMask, "starting tile alpha mask"))
    .ensureAlpha().resize(layout.width, layout.height, { fit: "fill" }).extractChannel("alpha").raw().toBuffer();
  const rgba = Buffer.alloc(layout.width * layout.height * 4);
  for (let index = 0; index < layout.width * layout.height; index += 1) {
    rgba[index * 4] = rgb.data[index * 3];
    rgba[index * 4 + 1] = rgb.data[index * 3 + 1];
    rgba[index * 4 + 2] = rgb.data[index * 3 + 2];
    rgba[index * 4 + 3] = alpha[index];
  }
  const output = insideRoot(contract.tile.output, "starting tile output");
  await mkdir(path.dirname(output), { recursive: true });
  await sharp(rgba, { raw: { width: layout.width, height: layout.height, channels: 4 } }).webp(WEBP).toFile(output);
  return output;
}

async function buildHeroes() {
  const layout = contract.layouts.hero;
  const outputs = [];
  for (const hero of contract.heroes) outputs.push(await outWebp(hero.master, hero.output, layout.width, layout.height));
  outputs.push(await reviewSheet(outputs, "mgq-heroes-contact-sheet.webp", 217, 290, 5));
  return outputs;
}

async function buildCommander() {
  const layout = contract.layouts.commander;
  const frame = await sharp(insideRoot(layout.frame, "commander frame")).resize(layout.width, layout.height, { fit: "fill" }).png().toBuffer();
  const patch = await sharp(frame).extract({ left: 90, top: 856, width: 124, height: 70 }).png().toBuffer();
  const art = await sharp(insideRoot(contract.commander.master, "commander master"))
    .resize(layout.artWindow.width, layout.artWindow.height, { fit: "cover", position: "top" }).png().toBuffer();
  const output = insideRoot(contract.commander.output, "commander output");
  await mkdir(path.dirname(output), { recursive: true });
  await sharp(frame)
    .composite([{ input: patch, left: 54, top: 756 }, { input: art, left: layout.artWindow.left, top: layout.artWindow.top }])
    .webp({ quality: 82, effort: 6 })
    .toFile(output);
  return output;
}

function buildEquipment() {
  const script = path.join(ROOT, "scripts/build-equipment-cards.mjs");
  for (const item of contract.equipment) {
    const result = spawnSync(process.execPath, [script, item.slug], { cwd: ROOT, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Equipment compositor failed for ${item.slug} with status ${result.status}`);
  }
  return contract.equipment.flatMap((item) => [insideRoot(item.iconOutput, `${item.id} icon`), insideRoot(item.cardOutput, `${item.id} card`)]);
}

async function buildIcons() {
  const outputs = [];
  for (const icon of contract.icons) {
    const layout = icon.kind === "specialty" ? contract.layouts.specialtyIcon : contract.layouts.icon;
    outputs.push(await outWebp(icon.master, icon.output, layout.width, layout.height, { fit: "contain", quality: 92 }));
  }
  outputs.push(await reviewSheet(outputs, "mgq-functional-icons-contact-sheet.webp", 160, 160, 7));
  return outputs;
}

const summary = validateContract();
const args = process.argv.slice(2);
if (args.includes("--check-contract")) {
  console.log(`MGQ art contract OK: ${summary.assets} masters / ${summary.outputs} direct outputs plus 7 derived town bars and 1 derived town icon.`);
  process.exit(0);
}
if (args.includes("--list-masters")) {
  for (const asset of allAssets()) console.log(asset.master);
  process.exit(0);
}
const requested = args.filter((arg) => !arg.startsWith("--"));
const unknown = requested.filter((group) => !GROUPS.has(group));
if (unknown.length) throw new Error(`Unknown MGQ art group(s): ${unknown.join(", ")}`);
const groups = new Set(requested.length ? requested : GROUPS);
await preflight(groups);
const outputs = [];
if (groups.has("town")) outputs.push(...await buildTown());
if (groups.has("tile")) outputs.push(await buildTile());
if (groups.has("heroes")) outputs.push(...await buildHeroes());
if (groups.has("commander")) outputs.push(await buildCommander());
if (groups.has("equipment")) outputs.push(...buildEquipment());
if (groups.has("icons")) outputs.push(...await buildIcons());
for (const output of outputs) console.log(path.relative(ROOT, output));

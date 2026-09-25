#!/usr/bin/env node
/**
 * Hex Battlefield siege scenes, town by town, exactly as the PC draws them:
 * every town's own backdrop, moat, background wall, keep (the one Arrow Tower,
 * centre, with its guard creature), the two corner towers (scenery only: they
 * never shoot), walls (intact / destroyed),
 * static wall pieces, gate arch and drawbridge (intact / destroyed), at the
 * PC's pixel positions on its 800x556 battlefield — the hex board draws the
 * PC grid pixel for pixel (hex-battlefield.tsx), so the positions carry over.
 *
 *   node scripts/build-siege-art.mjs --h3 <folder of SgXx*.bmp> --vcmi <folder of VCMI config/factions/*.json>
 *     [--hota <folder with cove/ bulwark/ factory/ from vcmi-mods/horn-of-the-abyss>]
 *
 * Sources: the classic towns' H3bitmap.lod siege bitmaps (SgCs…, SgRm…, 8-bit
 * BMP, palette slot 0 transparent, 1-4 shadow), their positions from VCMI's
 * config/factions/<town>.json "siege" blocks; the HotA towns' PNGs and
 * positions from the VCMI HotA mod (cove/bulwark siege.json, factory town.json).
 *
 * Output: public/assets/battle-hex/siege/<town>/<piece>.webp (media-managed:
 * run `npm run media:publish`) and src/data/battle-hex/siege-art.json: per
 * town its pieces (PC top-left + size), the keep guard's PC creature position
 * (the top-left of its 450x400 H3 canvas) and the guard's hex sprite slug.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public", "assets", "battle-hex", "siege");
const META_FILE = path.join(ROOT, "src", "data", "battle-hex", "siege-art.json");

/** Town -> H3 file prefix and VCMI config (classic) or HotA config (hota). */
const TOWNS = {
  castle: { prefix: "SgCs", source: "h3", config: "castle.json" },
  rampart: { prefix: "SgRm", source: "h3", config: "rampart.json" },
  tower: { prefix: "SgTw", source: "h3", config: "tower.json" },
  inferno: { prefix: "SgIn", source: "h3", config: "inferno.json" },
  necropolis: { prefix: "SgNc", source: "h3", config: "necropolis.json" },
  dungeon: { prefix: "SgDn", source: "h3", config: "dungeon.json" },
  stronghold: { prefix: "SgSt", source: "h3", config: "stronghold.json" },
  fortress: { prefix: "SgFr", source: "h3", config: "fortress.json" },
  conflux: { prefix: "SgEl", source: "h3", config: "conflux.json" },
  cove: { prefix: "SgCv", source: "hota", config: "cove/siege.json" },
  bulwark: { prefix: "SgBk", source: "hota", config: "bulwark/siege.json" },
  factory: { prefix: "SgFa", source: "hota", config: "factory/town.json" }
};

/**
 * Pieces: output name, file suffix(es) (first found wins), VCMI position path.
 * Walls: 1 = intact, 3 = destroyed (the board's Wall / Gate tokens stand or fall
 * whole). MAN2 is the keep's ruin.
 */
const PIECES = [
  ["back", ["BACK"], null],
  ["moat", ["MOAT"], "moat.moat"],
  ["moat-bank", ["MLIP"], "moat.bank"],
  ["background-wall", ["TPWL", "TPW1"], "static.background"],
  ["keep", ["MAN1"], "towers.keep.tower"],
  ["keep-ruin", ["MAN2"], "towers.keep.tower"],
  ["keep-battlement", ["MANC"], "towers.keep.battlement"],
  ["tower-upper", ["TW21"], "towers.top.tower"],
  ["tower-upper-battlement", ["TW2C"], "towers.top.battlement"],
  ["tower-bottom", ["TW11"], "towers.bottom.tower"],
  ["tower-bottom-battlement", ["TW1C"], "towers.bottom.battlement"],
  ["wall-upper", ["WA61"], "walls.upper"],
  ["wall-upper-ruin", ["WA63"], "walls.upper"],
  ["static-top", ["WA5"], "static.top"],
  ["wall-over-gate", ["WA41"], "walls.upperMid"],
  ["wall-over-gate-ruin", ["WA43"], "walls.upperMid"],
  ["gate-arch", ["ARCH"], "gate.arch"],
  ["gate", ["DRW1"], "gate.gate"],
  ["gate-ruin", ["DRW3"], "gate.gate"],
  ["wall-below-gate", ["WA31"], "walls.bottomMid"],
  ["wall-below-gate-ruin", ["WA33"], "walls.bottomMid"],
  ["static-bottom", ["WA2"], "static.bottom"],
  ["wall-bottom", ["WA11"], "walls.bottom"],
  ["wall-bottom-ruin", ["WA13"], "walls.bottom"]
];

/** The town's siege shooter (VCMI creature id) -> its hex sprite slug (Corsair: the Pirate). */
const GUARD_SPRITES = {
  archer: "archer", woodElf: "wood-elf", mage: "mage", gog: "gog", lich: "lich", medusa: "medusa", orc: "orc",
  lizardman: "lizardman", stormElemental: "storm-elemental", corsair: "pirate", snowElf: "snow-elf", gunslinger: "gunslinger"
};

/** Shadow alpha of the H3 special palette slots 1-4 (0 is transparent, 5-7 unused here). */
const SHADOW_ALPHA = { 1: 40, 2: 80, 3: 120, 4: 160 };

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/** 8-bit (or 24-bit) Windows BMP -> RGBA with the H3 special colours applied. */
function decodeBmp(file) {
  const b = fs.readFileSync(file);
  const offset = b.readUInt32LE(10);
  const width = b.readInt32LE(18);
  const rawHeight = b.readInt32LE(22);
  const bpp = b.readUInt16LE(28);
  const height = Math.abs(rawHeight);
  const bottomUp = rawHeight > 0;
  const stride = Math.ceil((width * bpp) / 32) * 4;
  const paletteStart = 14 + b.readUInt32LE(14);
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const row = offset + (bottomUp ? height - 1 - y : y) * stride;
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      if (bpp === 8) {
        const v = b[row + x];
        if (v === 0 || (v >= 5 && v <= 7)) continue;
        if (v <= 4) {
          rgba[o + 3] = SHADOW_ALPHA[v];
          continue;
        }
        rgba[o] = b[paletteStart + v * 4 + 2];
        rgba[o + 1] = b[paletteStart + v * 4 + 1];
        rgba[o + 2] = b[paletteStart + v * 4];
        rgba[o + 3] = 255;
      } else {
        rgba[o] = b[row + x * 3 + 2];
        rgba[o + 1] = b[row + x * 3 + 1];
        rgba[o + 2] = b[row + x * 3];
        rgba[o + 3] = 255;
      }
    }
  }
  return { width, height, rgba };
}

/** VCMI png frame: real alpha kept; the H3 key colours (cyan, magenta shadows) mapped like a BMP. */
async function decodePng(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    if ((r === 0 && g === 255 && b === 255) || (r === 255 && g === 255 && b === 0) ||
      (r === 180 && g === 0 && b === 255) || (r === 0 && g === 255 && b === 0)) {
      data[i + 3] = 0; // slots 0 and 5-7
    } else if (r === 255 && b === 255 && g <= 150) {
      // Shadow slots 1-4 (255,150|100|50|0,255) -> the BMP's 40/80/120/160 alpha.
      data[i] = data[i + 1] = data[i + 2] = 0;
      data[i + 3] = Math.min(data[i + 3], Math.round(160 - g * 0.8));
    }
  }
  return { width: info.width, height: info.height, rgba: data };
}

/** The "siege" object of a VCMI faction / HotA town config (JSON with tabs and trailing text). */
function siegeConfig(file) {
  const text = fs.readFileSync(file, "utf8");
  const start = text.indexOf("{", text.indexOf('"siege"'));
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    if (text[i] === "}" && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  throw new Error(`${file}: no siege block`);
}

const at = (object, dotted) => dotted.split(".").reduce((value, key) => value?.[key], object);

async function main() {
  const h3 = option("h3");
  const vcmi = option("vcmi");
  const hota = option("hota");
  if (!h3 || !vcmi) {
    console.error("usage: node scripts/build-siege-art.mjs --h3 <SgXx bmp folder> --vcmi <VCMI factions folder> [--hota <folder>]");
    process.exit(1);
  }
  const meta = {};
  for (const [town, spec] of Object.entries(TOWNS)) {
    const folder = spec.source === "h3" ? h3 : hota && path.join(hota, town);
    const configFile = spec.source === "h3" ? path.join(vcmi, spec.config) : hota && path.join(hota, spec.config);
    if (!folder || !fs.existsSync(folder) || !configFile || !fs.existsSync(configFile)) {
      console.log(`${town}: skipped (no source)`);
      continue;
    }
    const files = new Map(fs.readdirSync(folder).map((name) => [name.toLowerCase(), path.join(folder, name)]));
    const config = siegeConfig(configFile);
    const pieces = {};
    fs.mkdirSync(path.join(OUT_DIR, town), { recursive: true });
    for (const [name, suffixes, position] of PIECES) {
      const file = suffixes
        .flatMap((suffix) => [`${spec.prefix}${suffix}.bmp`, `${spec.prefix}${suffix}.png`])
        .map((candidate) => files.get(candidate.toLowerCase()))
        .find(Boolean);
      const point = position ? at(config, position) : { x: 0, y: 0 };
      if (!file || !point) continue; // e.g. Tower has no moat
      const image = file.endsWith(".bmp") ? decodeBmp(file) : await decodePng(file);
      await sharp(image.rgba, { raw: { width: image.width, height: image.height, channels: 4 } })
        .webp(name === "back" ? { quality: 86 } : { quality: 88, alphaQuality: 90, effort: 6 })
        .toFile(path.join(OUT_DIR, town, `${name}.webp`));
      pieces[name] = { x: point.x, y: point.y, width: image.width, height: image.height };
    }
    meta[town] = {
      pieces,
      keepGuard: config.towers?.keep?.creature ?? null,
      guardSprite: GUARD_SPRITES[config.shooter] ?? null
    };
    console.log(`${town}: ${Object.keys(pieces).length} pieces`);
  }
  fs.writeFileSync(META_FILE, `${JSON.stringify(meta, null, 2)}\n`);
}

main();

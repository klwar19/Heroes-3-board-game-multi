#!/usr/bin/env node
/**
 * Hex Battlefield obstacles: converts the Heroes 3 battlefield obstacle .defs
 * (H3sprite.lod ObXXX.def) into WebP art and writes the engine catalog of their
 * blocked-hex footprints and battlefield eligibility.
 *
 *   node scripts/build-pc-obstacles.mjs <vcmi config/obstacles.json> <folder-with-ObXXX.defs>
 *
 * Footprints and terrain eligibility come from the open-source VCMI engine's
 * config/obstacles.json (the "usual" obstacles; its absolute .pcx obstacles are
 * not used). A footprint offset is an index delta on the PC's 17-wide battle
 * grid measured from an EVEN-row anchor (VCMI shifts odd-row anchors so that
 * -16 is always the top-right hex); it is stored here as a (column, row) step
 * from an even-row anchor, which the engine turns into a cube translation.
 *
 * Output:
 *   public/assets/battle-hex/pc-obstacles/<id>.webp    (media-managed)
 *   src/engine/hex-pc-obstacles.ts                     (generated catalog)
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public", "assets", "battle-hex", "pc-obstacles");
const CATALOG = path.join(ROOT, "src", "engine", "hex-pc-obstacles.ts");

function decodeFirstFrame(file) {
  const b = fs.readFileSync(file);
  const palette = [];
  for (let i = 0; i < 256; i += 1) palette.push([b[16 + i * 3], b[17 + i * 3], b[18 + i * 3]]);
  const count = b.readUInt32LE(16 + 768 + 4);
  const o = b.readUInt32LE(16 + 768 + 16 + count * 13);
  const format = b.readUInt32LE(o + 4);
  const fullWidth = b.readUInt32LE(o + 8);
  const fullHeight = b.readUInt32LE(o + 12);
  const w = b.readUInt32LE(o + 16);
  const h = b.readUInt32LE(o + 20);
  const left = b.readUInt32LE(o + 24);
  const top = b.readUInt32LE(o + 28);
  const d = o + 32;
  const px = new Uint8Array(fullWidth * fullHeight);
  const put = (x, y, v) => {
    px[(y + top) * fullWidth + x + left] = v;
  };
  if (format === 0) {
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) put(x, y, b[d + y * w + x]);
  } else if (format === 1) {
    for (let y = 0; y < h; y += 1) {
      let q = d + b.readUInt32LE(d + y * 4);
      for (let x = 0; x < w; ) {
        const code = b[q];
        const length = b[q + 1] + 1;
        q += 2;
        for (let i = 0; i < length; i += 1) put(x + i, y, code === 0xff ? b[q + i] : code);
        if (code === 0xff) q += length;
        x += length;
      }
    }
  } else {
    for (let y = 0; y < h; y += 1) {
      let q = d + b.readUInt16LE(d + (format === 2 ? y * 2 : ((y * w) / 32) * 2));
      for (let x = 0; x < w; ) {
        const segment = b[q++];
        const code = segment >> 5;
        const length = (segment & 31) + 1;
        for (let i = 0; i < length; i += 1) put(x + i, y, code === 7 ? b[q + i] : code);
        if (code === 7) q += length;
        x += length;
      }
    }
  }
  const rgba = Buffer.alloc(fullWidth * fullHeight * 4);
  const shadow = { 1: 64, 2: 96, 3: 96, 4: 128, 6: 64, 7: 128 };
  for (let i = 0; i < px.length; i += 1) {
    const v = px[i];
    if (v === 0 || v === 5) continue;
    if (v > 7) {
      const [r, g, bl] = palette[v];
      rgba[i * 4] = r;
      rgba[i * 4 + 1] = g;
      rgba[i * 4 + 2] = bl;
      rgba[i * 4 + 3] = 255;
    } else {
      rgba[i * 4 + 3] = shadow[v] ?? 0;
    }
  }
  return { width: fullWidth, height: fullHeight, rgba };
}

async function main() {
  const [configPath, folder] = process.argv.slice(2);
  if (!configPath || !folder) {
    console.error("usage: node scripts/build-pc-obstacles.mjs <vcmi obstacles.json> <folder-with-ObXXX.defs>");
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(configPath, "utf8").replace(/^\s*\/\/.*$/gm, ""));
  const files = new Map(fs.readdirSync(folder).map((name) => [name.toLowerCase(), name]));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const entries = [];
  for (const obstacle of Object.values(config)) {
    if (obstacle.absolute) continue;
    const file = files.get(obstacle.animation.toLowerCase());
    if (!file) {
      console.log(`missing ${obstacle.animation}`);
      continue;
    }
    const id = obstacle.animation.replace(/\.def$/i, "");
    const frame = decodeFirstFrame(path.join(folder, file));
    await sharp(frame.rgba, { raw: { width: frame.width, height: frame.height, channels: 4 } })
      .webp({ quality: 80, alphaQuality: 80, effort: 6 })
      .toFile(path.join(OUT_DIR, `${id}.webp`));
    const tiles = obstacle.blockedTiles.map((offset) => {
      const row = Math.round(offset / 17);
      return [offset - row * 17, row];
    });
    entries.push({
      id,
      width: frame.width,
      height: frame.height,
      tiles,
      terrains: obstacle.allowedTerrains ?? [],
      special: obstacle.specialBattlefields ?? []
    });
  }
  entries.sort((a, b) => a.id.localeCompare(b.id));
  const lines = entries.map((entry) =>
    `  { id: ${JSON.stringify(entry.id)}, width: ${entry.width}, height: ${entry.height}, tiles: ${JSON.stringify(entry.tiles)}, terrains: ${JSON.stringify(entry.terrains)}, special: ${JSON.stringify(entry.special)} }`
  );
  const source = `// GENERATED by scripts/build-pc-obstacles.mjs — do not edit by hand.
// Heroes 3 battlefield obstacles for the Hex Battlefield. Footprints and
// terrain eligibility from the VCMI engine's config/obstacles.json ("usual"
// obstacles). \`tiles\` are (column, row) steps from an EVEN-row anchor hex;
// \`width\`/\`height\` are the art's PC pixel size (anchored at the anchor hex's
// left edge, bottom 16 px below its centre).

export type PcObstacleDefinition = {
  id: string;
  width: number;
  height: number;
  tiles: ReadonlyArray<readonly [number, number]>;
  /** VCMI terrain types the obstacle may appear on (ordinary battlefields). */
  terrains: readonly string[];
  /** Special battlefields (beach, cursed ground, ...) — only these are checked there. */
  special: readonly string[];
};

export const PC_OBSTACLES: readonly PcObstacleDefinition[] = [
${lines.join(",\n")}
];
`;
  fs.writeFileSync(CATALOG, source);
  console.log(`${entries.length} obstacles -> ${path.relative(ROOT, OUT_DIR)}, catalog ${path.relative(ROOT, CATALOG)}`);
}

main();

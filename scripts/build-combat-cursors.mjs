#!/usr/bin/env node
/**
 * Hex Battlefield mouse cursors, cut from the Heroes 3 combat cursor file
 * CRCOMBAT.def (H3sprite.lod, type 0x46: 20 frames of 36x36):
 *
 *   0 blocked, 1 move (walk), 2 fly, 3 shoot, 4 hero, 5 query, 6 pointer,
 *   7-14 attack swords pointing NE, E, SE, SW, W, NW, N, S,
 *   15 shoot with penalty (broken arrow), 16 catapult, 17 heal (First Aid),
 *   18 sacrifice, 19 teleport.
 *
 *   node scripts/build-combat-cursors.mjs <path/to/CRCOMBAT.def>
 *
 * Output: public/assets/battle-hex/cursors/<name>.png, drawn at 2x with hard
 * pixels (media-managed: run `npm run media:publish`), and
 * src/data/battle-hex/combat-cursors.json with each cursor's hotspot in those
 * 2x pixels: an attack sword's hotspot is its blade tip (the point that goes
 * into the target), every other cursor's is its centre.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { decodeDef } from "./build-creature-sprites.mjs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public", "assets", "battle-hex", "cursors");
const META_FILE = path.join(ROOT, "src", "data", "battle-hex", "combat-cursors.json");
const SCALE = 2;

/** Frame index -> cursor name, and for the swords the direction the blade points (screen y down). */
const CURSORS = [
  { frame: 0, name: "blocked" },
  { frame: 1, name: "move" },
  { frame: 2, name: "fly" },
  { frame: 3, name: "shoot" },
  { frame: 5, name: "query" },
  { frame: 7, name: "attack-ne", point: [1, -1] },
  { frame: 8, name: "attack-e", point: [1, 0] },
  { frame: 9, name: "attack-se", point: [1, 1] },
  { frame: 10, name: "attack-sw", point: [-1, 1] },
  { frame: 11, name: "attack-w", point: [-1, 0] },
  { frame: 12, name: "attack-nw", point: [-1, -1] },
  { frame: 13, name: "attack-n", point: [0, -1] },
  { frame: 14, name: "attack-s", point: [0, 1] },
  { frame: 15, name: "shoot-penalty" },
  { frame: 17, name: "heal" },
  { frame: 19, name: "teleport" }
];

async function main() {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) {
    console.error("usage: node scripts/build-combat-cursors.mjs <CRCOMBAT.def>");
    process.exit(1);
  }
  const def = decodeDef(file, { types: [0x46] });
  const frames = def.groups.flatMap((group) => group.frames);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const meta = {};
  for (const cursor of CURSORS) {
    const frame = frames[cursor.frame];
    if (!frame) throw new Error(`CRCOMBAT.def has no frame ${cursor.frame}`);
    const { width, height, pixels } = frame;
    const rgba = Buffer.alloc(width * height * 4);
    let minX = width, minY = height, maxX = -1, maxY = -1;
    let tip = null;
    let best = -Infinity;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const v = pixels[y * width + x];
        if (v === 0) continue;
        const o = (y * width + x) * 4;
        // Special slots 1-7 (shadow / outline) are the cursor's translucent edge.
        const [r, g, b] = v > 7 ? def.palette[v] : [0, 0, 0];
        rgba[o] = r;
        rgba[o + 1] = g;
        rgba[o + 2] = b;
        rgba[o + 3] = v > 7 ? 255 : 128;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        if (cursor.point && v > 7) {
          const reach = x * cursor.point[0] + y * cursor.point[1];
          if (reach > best) {
            best = reach;
            tip = [x, y];
          }
        }
      }
    }
    const hotspot = tip ?? [(minX + maxX + 1) / 2, (minY + maxY + 1) / 2];
    await sharp(rgba, { raw: { width, height, channels: 4 } })
      .resize(width * SCALE, height * SCALE, { kernel: "nearest" })
      .png({ compressionLevel: 9 })
      .toFile(path.join(OUT_DIR, `${cursor.name}.png`));
    meta[cursor.name] = {
      image: `/assets/battle-hex/cursors/${cursor.name}.png`,
      hotX: Math.min(width * SCALE - 1, Math.round(hotspot[0] * SCALE + (tip ? SCALE / 2 : 0))),
      hotY: Math.min(height * SCALE - 1, Math.round(hotspot[1] * SCALE + (tip ? SCALE / 2 : 0)))
    };
  }
  fs.writeFileSync(META_FILE, `${JSON.stringify(meta, null, 2)}\n`);
  console.log(`${Object.keys(meta).length} cursors -> ${path.relative(ROOT, OUT_DIR)}`);
}

main();

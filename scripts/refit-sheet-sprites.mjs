#!/usr/bin/env node
/**
 * Hex Battlefield: refits creature atlases that were cut from a generated
 * SPRITE SHEET (scripts/import-sprite-sheet.mjs — the Forge creatures) so they
 * stand on the board like the Heroes 3 .def creatures around them:
 *
 *  - SIZE like its H3 peers: the standing body is as tall as the H3 creatures
 *    of its level, unless that would make it far heavier than them (the
 *    importer's single reference made bulky sheet creatures — a tentacled
 *    Watcher, a tank — huge, and body-mass matching alone made them squat).
 *  - STEADY frames: generated frames drift a few pixels in baseline, position
 *    and size from cell to cell, which reads as wobbling. Every frame's feet are
 *    put back on the standing frame's baseline (small drifts only — a real jump
 *    or lunge is kept), idle/walk/hit/defend/turn frames are re-centred on the
 *    standing feet and idle/walk frames get the standing body height back.
 *  - CLEAN cells: a generated frame that overran its grid cell leaves pieces
 *    of its neighbour in the next cell: small pieces cut off at the cell's side
 *    edge, and small dark pieces standing apart from the body, are cleared
 *    (bright sparks and muzzle flashes near the body are kept).
 *  - H3 FINISH: hard 1-bit alpha edges (H3 creatures have no soft edges) and the
 *    H3 ground shadow — the frame's own silhouette flattened onto the ground,
 *    leaning up and to the right of the feet at ~37% black, like the shadow
 *    palette slots of the .def creatures.
 *
 *   node scripts/refit-sheet-sprites.mjs            (every creature in TARGETS)
 *   node scripts/refit-sheet-sprites.mjs forge-tank forge-tank-pack
 *
 * Mech Princess (the Forge commander, commander-forge) is imported the same way:
 *   node scripts/import-sprite-sheet.mjs tmp/gen/forge-sheets/commander-forge.png commander-forge --grid 8x6
 *     --rows "2:8;0:8;12:8;3:4+4:4;5:8;7:4+18:4" --copy "11=12,13=12,17=18,19=18" --reverse "8=7" --ref commander-paladin
 *
 * The first run keeps the importer's output in tmp/gen/sheet-sprite-originals/
 * (<slug>.webp + <slug>.json); every run starts from that copy, so the refit is
 * repeatable and never compounds. Re-importing a sheet: delete its backup.
 * Output: public/assets/battle-hex/creatures/<slug>.webp (media-managed: run
 * `npm run media:publish`) and its entry in creature-sprite-atlases.json.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
sharp.cache(false);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const META_FILE = path.join(ROOT, "src", "data", "battle-hex", "creature-sprite-atlases.json");
const BACKUP_DIR = path.join(ROOT, "tmp", "gen", "sheet-sprite-originals");

/**
 * Standing-body HEIGHT (H3 pixels, head to feet) each creature is refitted to,
 * from its H3 peers of the same level (measured on the .def atlases — H3
 * creatures are tall and slender): L1 Goblin/Gremlin/Imp ~64-75, L2 Zombie/Gog
 * ~80-84, L3 Evil Eye/Medusa ~88-93, L4 Ogre/Minotaur ~83-92, L5 Ogre Mage/
 * Cyclops ~97-102, L6 Cavalier/Dread Knight/War Unicorn ~100-107, L7 Behemoth/
 * Black Dragon ~98-105, commanders (Paladin/Succubus) ~94-98. A Pack side (the
 * upgrade) stands a little taller. `maxArea` caps the standing body's opaque
 * area (alpha > 200) at ~1.3x its peers', so a creature much wider than an H3
 * one (a tentacled Watcher, a tank) is not blown up to that height.
 */
const TARGETS = {
  "forge-grunt": { height: 72, maxArea: 1950 }, "forge-grunt-pack": { height: 76, maxArea: 2100 },
  "forge-cyber-zombie": { height: 86, maxArea: 2350 }, "forge-cyber-zombie-pack": { height: 90, maxArea: 2500 },
  "forge-watcher": { height: 90, maxArea: 2500 }, "forge-watcher-pack": { height: 94, maxArea: 2750 },
  "forge-bruiser": { height: 94, maxArea: 2950 }, "forge-bruiser-pack": { height: 98, maxArea: 3200 },
  "forge-jump-trooper": { height: 98, maxArea: 3400 }, "forge-jump-trooper-pack": { height: 102, maxArea: 3650 },
  "forge-tank": { height: 102, maxArea: 4900 }, "forge-tank-pack": { height: 106, maxArea: 5200 },
  "forge-cyberbrute": { height: 104, maxArea: 7200 }, "forge-cyberbrute-pack": { height: 108, maxArea: 7500 },
  // Mech Princess, the Forge commander: a WoG commander figure (Paladin / Succubus).
  "commander-forge": { height: 98, maxArea: 2900 }
};

/** H3 groups whose frames stand in place (re-centred on the standing feet). */
const IN_PLACE_GROUPS = new Set([0, 2, 3, 4, 7, 8]);
/** Groups whose body height is pinned to the standing frame's (no size pulsing). */
const STEADY_HEIGHT_GROUPS = new Set([0, 2]);
/** Larger drifts are deliberate (a hop, a lunge, a fall) and kept. */
const MAX_BASELINE_FIX = 14;
const MAX_CENTRE_FIX = 12;
const MAX_HEIGHT_FIX = 0.14;
/** H3 shadow: silhouette flattened to this share of its height, leaning right by this share. */
const SHADOW_FLATTEN = 0.26;
const SHADOW_LEAN = 0.2;
const SHADOW_ALPHA = 95;

/** Opaque box, area and foot centre (lowest quarter of the body) of one RGBA frame. */
function measure(data, width, height) {
  let top = -1, bottom = -1, left = width, right = -1, area = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const a = data[(y * width + x) * 4 + 3];
      if (a > 128) {
        if (top < 0) top = y;
        bottom = y;
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
      if (a > 200) area += 1;
    }
  }
  if (top < 0) return null;
  const band = Math.max(6, Math.round((bottom - top + 1) / 4));
  let footMin = width, footMax = -1;
  for (let y = bottom - band; y <= bottom; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 128) {
        footMin = Math.min(footMin, x);
        footMax = Math.max(footMax, x);
      }
    }
  }
  return { top, bottom, left, right, area, footX: (footMin + footMax) / 2 };
}

/**
 * Clears pieces of a neighbouring frame that bled into this cell: small DARK
 * opaque islands standing apart from the frame's main body (a stray chunk of
 * the next frame's weapon). Sparks, muzzle flashes and energy bolts are bright
 * and are kept.
 */
function clearBleed(data, width, height, { edgeOnly = false } = {}) {
  const label = new Int32Array(width * height).fill(-1);
  const islands = [];
  for (let start = 0; start < width * height; start += 1) {
    if (label[start] >= 0 || data[start * 4 + 3] <= 128) continue;
    const id = islands.length;
    const pixels = [start];
    let left = width, right = -1, top = height, bottom = -1, light = 0;
    label[start] = id;
    for (let i = 0; i < pixels.length; i += 1) {
      const p = pixels[i];
      const x = p % width;
      const y = (p - x) / width;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
      light += Math.max(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]);
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const q = ny * width + nx;
        if (label[q] < 0 && data[q * 4 + 3] > 128) {
          label[q] = id;
          pixels.push(q);
        }
      }
    }
    islands.push({ pixels, left, right, top, bottom, light: light / pixels.length });
  }
  if (islands.length < 2) return data;
  const main = islands.reduce((best, island) => (island.pixels.length > best.pixels.length ? island : best));
  const mainId = islands.indexOf(main);
  for (const island of islands) {
    if (island === main || island.pixels.length >= main.pixels.length * 0.1) continue;
    if (edgeOnly) {
      // A piece cut off at the cell's side edge came from the neighbouring frame (any colour).
      if (island.left === 0 || island.right === width - 1) {
        for (const p of island.pixels) data[p * 4 + 3] = 0;
      }
      continue;
    }
    if (island.light >= 120) continue;
    // Apart = no main-body pixel within 6 px of any of its pixels.
    const near = island.pixels.some((p) => {
      const x = p % width;
      const y = (p - x) / width;
      for (let yy = Math.max(0, y - 6); yy <= Math.min(height - 1, y + 6); yy += 1) {
        for (let xx = Math.max(0, x - 6); xx <= Math.min(width - 1, x + 6); xx += 1) {
          if (label[yy * width + xx] === mainId) return true;
        }
      }
      return false;
    });
    if (!near) {
      for (const p of island.pixels) data[p * 4 + 3] = 0;
    }
  }
  return data;
}

async function frameRgba(atlasFile, meta, row, column) {
  const data = await sharp(atlasFile)
    .extract({ left: column * meta.frameWidth, top: row * meta.frameHeight, width: meta.frameWidth, height: meta.frameHeight })
    .ensureAlpha()
    .raw()
    .toBuffer();
  return clearBleed(data, meta.frameWidth, meta.frameHeight, { edgeOnly: true });
}

async function refit(slug, target) {
  const backupImage = path.join(BACKUP_DIR, `${slug}.webp`);
  const backupMeta = path.join(BACKUP_DIR, `${slug}.json`);
  const liveImage = path.join(ROOT, "public", "assets", "battle-hex", "creatures", `${slug}.webp`);
  const allMeta = JSON.parse(fs.readFileSync(META_FILE, "utf8"));
  if (!fs.existsSync(backupImage)) {
    if (!allMeta[slug] || !fs.existsSync(liveImage)) throw new Error(`${slug}: no atlas to refit`);
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    fs.copyFileSync(liveImage, backupImage);
    fs.writeFileSync(backupMeta, `${JSON.stringify(allMeta[slug], null, 2)}\n`);
  }
  const meta = JSON.parse(fs.readFileSync(backupMeta, "utf8"));
  const source = fs.readFileSync(backupImage);
  const { frameWidth: fw, frameHeight: fh } = meta;
  const groups = Object.entries(meta.groups)
    .map(([id, info]) => ({ id: Number(id), ...info }))
    .sort((a, b) => a.row - b.row);

  const standingGroup = groups.find((group) => group.id === 2) ?? groups[0];
  const standing = measure(await frameRgba(source, meta, standingGroup.row, 0), fw, fh);
  const standingHeight = standing.bottom - standing.top + 1;
  const scale = Math.min(target.height / standingHeight, Math.sqrt(target.maxArea / standing.area));

  // Every corrected frame, drawn at `scale` on a generous canvas with its feet
  // on (padX + footX*scale, padY + bottom*scale) of the standing frame.
  const padX = Math.ceil(fw * scale * 0.5);
  const padY = Math.ceil(fh * scale * 0.25);
  const canvasW = Math.ceil(fw * scale) + padX * 2;
  const canvasH = Math.ceil(fh * scale) + padY * 2;
  const footX = padX + standing.footX * scale;
  const footY = padY + (standing.bottom + 1) * scale;

  const frames = [];
  for (const group of groups) {
    for (let column = 0; column < group.frames; column += 1) {
      const rgba = await frameRgba(source, meta, group.row, column);
      const box = measure(rgba, fw, fh);
      const canvas = Buffer.alloc(canvasW * canvasH * 4);
      if (box) {
        let frameScale = scale;
        if (STEADY_HEIGHT_GROUPS.has(group.id)) {
          const ratio = standingHeight / (box.bottom - box.top + 1);
          if (Math.abs(ratio - 1) <= MAX_HEIGHT_FIX) frameScale *= ratio;
        }
        const baselineFix = standing.bottom - box.bottom;
        const dy = Math.abs(baselineFix) <= MAX_BASELINE_FIX ? baselineFix : 0;
        const centreFix = standing.footX - box.footX;
        const dx = IN_PLACE_GROUPS.has(group.id) && Math.abs(centreFix) <= MAX_CENTRE_FIX ? centreFix : 0;
        // Scale about the frame's own feet, then place those feet (plus any
        // deliberate offset) relative to the standing feet.
        const w = Math.max(1, Math.round(fw * frameScale));
        const h = Math.max(1, Math.round(fh * frameScale));
        const resized = await sharp(rgba, { raw: { width: fw, height: fh, channels: 4 } })
          .resize(w, h, { kernel: "lanczos3" })
          .raw()
          .toBuffer();
        // After the resize: a thin bridge to a stray piece is gone by now.
        clearBleed(resized, w, h);
        const frameFootX = (box.footX + dx) * frameScale;
        const frameFootY = (box.bottom + 1 + dy) * frameScale;
        const ownFootX = footX + (box.footX + dx - standing.footX) * scale;
        const ownFootY = footY + (box.bottom + 1 + dy - (standing.bottom + 1)) * scale;
        const offX = Math.round(ownFootX - frameFootX);
        const offY = Math.round(ownFootY - frameFootY);
        for (let y = 0; y < h; y += 1) {
          const cy = y + offY;
          if (cy < 0 || cy >= canvasH) continue;
          for (let x = 0; x < w; x += 1) {
            const cx = x + offX;
            if (cx < 0 || cx >= canvasW) continue;
            const s = (y * w + x) * 4;
            // H3 creatures have 1-bit edges.
            if (resized[s + 3] < 128) continue;
            const o = (cy * canvasW + cx) * 4;
            canvas[o] = resized[s];
            canvas[o + 1] = resized[s + 1];
            canvas[o + 2] = resized[s + 2];
            canvas[o + 3] = 255;
          }
        }
        // Ground shadow from this frame's silhouette (behind the body only).
        const groundY = Math.round(footY);
        const shadow = new Uint8Array(canvasW * canvasH);
        for (let y = 0; y < canvasH; y += 1) {
          for (let x = 0; x < canvasW; x += 1) {
            if (canvas[(y * canvasW + x) * 4 + 3] === 0) continue;
            const rise = Math.max(0, groundY - y);
            const sx = Math.round(x + rise * SHADOW_LEAN);
            const sy = Math.round(groundY - rise * SHADOW_FLATTEN - (y > groundY ? groundY - y : 0));
            if (sx >= 0 && sx < canvasW && sy >= 0 && sy < canvasH) shadow[sy * canvasW + sx] = 1;
          }
        }
        for (let i = 0; i < shadow.length; i += 1) {
          if (shadow[i] && canvas[i * 4 + 3] === 0) canvas[i * 4 + 3] = SHADOW_ALPHA;
        }
      }
      frames.push({ group: group.id, row: group.row, column, canvas });
    }
  }

  // Crop every frame to the union box so the anchor stays one constant point.
  let minX = canvasW, minY = canvasH, maxX = -1, maxY = -1;
  for (const { canvas } of frames) {
    for (let y = 0; y < canvasH; y += 1) {
      for (let x = 0; x < canvasW; x += 1) {
        if (canvas[(y * canvasW + x) * 4 + 3] === 0) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const cellW = maxX - minX + 1;
  const cellH = maxY - minY + 1;
  const columns = Math.max(...groups.map((group) => group.frames));
  const atlasW = columns * cellW;
  const atlas = Buffer.alloc(atlasW * groups.length * cellH * 4);
  for (const { row, column, canvas } of frames) {
    for (let y = 0; y < cellH; y += 1) {
      const from = ((y + minY) * canvasW + minX) * 4;
      const to = ((row * cellH + y) * atlasW + column * cellW) * 4;
      canvas.copy(atlas, to, from, from + cellW * 4);
    }
  }
  await sharp(atlas, { raw: { width: atlasW, height: groups.length * cellH, channels: 4 } })
    .webp({ quality: 82, alphaQuality: 90, effort: 6, smartSubsample: true })
    .toFile(liveImage);

  const fresh = JSON.parse(fs.readFileSync(META_FILE, "utf8"));
  fresh[slug] = {
    ...meta,
    frameWidth: cellW,
    frameHeight: cellH,
    columns,
    anchorX: Math.round(footX - minX),
    anchorY: Math.round(footY - minY)
  };
  const sorted = Object.fromEntries(Object.keys(fresh).sort().map((key) => [key, fresh[key]]));
  fs.writeFileSync(META_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(
    `${slug}: scale ${scale.toFixed(3)} (height ${standingHeight} -> ${Math.round(standingHeight * scale)}, area ${Math.round(standing.area * scale * scale)}), ${cellW}x${cellH} frames, anchor (${fresh[slug].anchorX}, ${fresh[slug].anchorY})`
  );
}

const slugs = process.argv.slice(2);
for (const slug of slugs.length > 0 ? slugs : Object.keys(TARGETS)) {
  if (!TARGETS[slug]) {
    console.error(`${slug}: no refit target (add it to TARGETS)`);
    process.exitCode = 1;
    continue;
  }
  await refit(slug, TARGETS[slug]);
}

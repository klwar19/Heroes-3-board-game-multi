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
 *  - CORPSE like an H3 one: generated death rows draw the fallen body high in
 *    the cell (it floated above its own ground shadow, between two hex rows)
 *    and stretched out ~2 hexes long, with pieces of the next sheet row below
 *    it. The death group is cleaned to the body (every piece apart from it
 *    goes), the fall lands the corpse across its hex like the .def corpses
 *    (bottom CORPSE_BOTTOM px above the feet row, centred on the hex), sized to
 *    at most CORPSE_MAX_LENGTH (the fall eases the body from the standing scale
 *    into that size, so the clip never pops), and each death frame's shadow is
 *    cast from the ground it lies on.
 *
 *   node scripts/refit-sheet-sprites.mjs            (every creature in TARGETS)
 *   node scripts/refit-sheet-sprites.mjs forge-tank forge-tank-pack
 *
 * The other Forge creatures and Mech Princess (commander-forge) are no longer
 * sheet imports: they are rotoscoped from real H3 creatures
 * (scripts/pose-sprite-manifest.json, scripts/import-pose-guided-sheet.mjs), so
 * they are not in TARGETS — a refit would put the old sheet sprites back.
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
  // Two-hex creatures (hex-footprint): their corpse may span both hexes.
  "forge-tank": { height: 102, maxArea: 4900, twoHex: true }, "forge-tank-pack": { height: 106, maxArea: 5200, twoHex: true },
  // Cove Cannon (war machine, no PC original): the Ballista's size class (H3 Ballista
  // standing body 76 px tall, opaque area ~4100). Sheet keyed + regridded by
  // scripts/key-sheet-background.mjs first (see its header for the import commands).
  "war-cannon": { height: 72, maxArea: 4100 }
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
/** H3 death group id. */
const DEATH_GROUP = 5;
/**
 * The corpse (last death frame), measured on the H3 .def creatures: it lies
 * across its hex — its lowest pixel ~8 px above the feet row (goblin, orc,
 * gnoll, imp, zombie, swordsman: -6..-10), centred on the hex — and a one-hex
 * body is 40-51 px long (HotA's Kobold / Pirate / Crew Mate 60-71), a two-hex
 * one ~70-80 (Black Knight, Cavalier, Behemoth). A stretched-out generated body
 * is capped a little above HotA's: ~1.45 hexes, ~2.3 for a two-hex creature.
 */
const CORPSE_BOTTOM = -8;
const CORPSE_MAX_LENGTH = { oneHex: 64, twoHex: 100 };

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

/**
 * A death frame keeps only its body: every piece standing apart from the main
 * body (no body pixel within 6 px) is cleared whatever its colour or size —
 * generated death rows pick up chunks of the next sheet row (weapons, heads,
 * spell bolts) under the fallen body.
 */
function keepBody(data, width, height) {
  const label = new Int32Array(width * height).fill(-1);
  const islands = [];
  for (let start = 0; start < width * height; start += 1) {
    if (label[start] >= 0 || data[start * 4 + 3] <= 128) continue;
    const id = islands.length;
    const pixels = [start];
    label[start] = id;
    for (let i = 0; i < pixels.length; i += 1) {
      const p = pixels[i];
      const x = p % width;
      const y = (p - x) / width;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const q = ny * width + nx;
        if (label[q] < 0 && data[q * 4 + 3] > 128) {
          label[q] = id;
          pixels.push(q);
        }
      }
    }
    islands.push(pixels);
  }
  if (islands.length < 2) return data;
  const main = islands.reduce((best, island) => (island.length > best.length ? island : best));
  const mainId = islands.indexOf(main);
  // The main body grown by 6 px: a piece touching that stays.
  const near = new Uint8Array(width * height);
  for (const p of main) {
    const x = p % width;
    const y = (p - x) / width;
    for (let yy = Math.max(0, y - 6); yy <= Math.min(height - 1, y + 6); yy += 1) {
      near.fill(1, yy * width + Math.max(0, x - 6), yy * width + Math.min(width - 1, x + 6) + 1);
    }
  }
  for (const [id, island] of islands.entries()) {
    if (id === mainId || island.some((p) => near[p])) continue;
    for (const p of island) data[p * 4 + 3] = 0;
  }
  // Faint (alpha <= 128) leftovers of cleared pieces go too.
  for (let p = 0; p < width * height; p += 1) {
    if (data[p * 4 + 3] > 0 && data[p * 4 + 3] <= 128 && !near[p]) data[p * 4 + 3] = 0;
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

  // The corpse: how far the fall shrinks the body (to CORPSE_MAX_LENGTH) and
  // how far the last frame moves to lie centred on the hex.
  const deathGroup = groups.find((group) => group.id === DEATH_GROUP);
  let corpse = null;
  if (deathGroup) {
    const last = measure(keepBody(await frameRgba(source, meta, deathGroup.row, deathGroup.frames - 1), fw, fh), fw, fh);
    if (last) {
      const length = (last.right - last.left + 1) * scale;
      const shrink = Math.min(1, CORPSE_MAX_LENGTH[target.twoHex ? "twoHex" : "oneHex"] / length);
      const centre = (last.left + last.right + 1) / 2;
      corpse = { shrink, shiftX: -(centre - standing.footX) * scale * shrink };
    }
  }

  const frames = [];
  for (const group of groups) {
    for (let column = 0; column < group.frames; column += 1) {
      const dying = group.id === DEATH_GROUP && corpse !== null;
      const rgba = await frameRgba(source, meta, group.row, column);
      if (dying) keepBody(rgba, fw, fh);
      const box = measure(rgba, fw, fh);
      const canvas = Buffer.alloc(canvasW * canvasH * 4);
      if (box) {
        // How far into the fall this death frame is (0 standing .. 1 the corpse).
        const fall = dying ? (group.frames > 1 ? column / (group.frames - 1) : 1) : 0;
        let frameScale = dying ? scale * (1 + (corpse.shrink - 1) * fall) : scale;
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
        let offX = Math.round(ownFootX - frameFootX);
        let offY = Math.round(ownFootY - frameFootY);
        // The frame's ground (its shadow is cast from here).
        let groundY = Math.round(footY);
        if (dying) {
          // Death frames: the sheet's own layout, scaled with the fall about the
          // standing feet and carried to the corpse spot as the body goes down;
          // the body always rests on the ground (the feet row, easing to
          // CORPSE_BOTTOM for the corpse).
          const centre = (box.left + box.right + 1) / 2;
          const targetX = footX + (centre - standing.footX) * frameScale + corpse.shiftX * fall;
          const targetBottom = footY + CORPSE_BOTTOM * fall;
          offX = Math.round(targetX - centre * frameScale);
          offY = Math.round(targetBottom - (box.bottom + 1) * frameScale);
          groundY = Math.round(targetBottom);
        }
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
  // One sheet row per atlas row (groups that share a row — the attack
  // up/straight/down copies — share it; no empty rows below).
  const rowCount = Math.max(...groups.map((group) => group.row)) + 1;
  const atlas = Buffer.alloc(atlasW * rowCount * cellH * 4);
  for (const { row, column, canvas } of frames) {
    for (let y = 0; y < cellH; y += 1) {
      const from = ((y + minY) * canvasW + minX) * 4;
      const to = ((row * cellH + y) * atlasW + column * cellW) * 4;
      canvas.copy(atlas, to, from, from + cellW * 4);
    }
  }
  await sharp(atlas, { raw: { width: atlasW, height: rowCount * cellH, channels: 4 } })
    .webp({ quality: 82, alphaQuality: 90, effort: 6, smartSubsample: true })
    .toFile(liveImage);

  const fresh = JSON.parse(fs.readFileSync(META_FILE, "utf8"));
  fresh[slug] = {
    ...meta,
    frameWidth: cellW,
    frameHeight: cellH,
    columns,
    anchorX: Math.round(footX - minX),
    anchorY: Math.round(footY - minY),
    // A generated idle row is not drawn as a loop (its last frame need not lead
    // back into its first): the board plays it back and forth while it idles.
    idlePingPong: true
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

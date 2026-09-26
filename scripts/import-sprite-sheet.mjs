#!/usr/bin/env node
/**
 * Hex Battlefield creature sprites from a SPRITE SHEET (Codex image_gen,
 * ludo.ai, hand-drawn...) instead of a Heroes 3 .def: slices an evenly spaced
 * grid, removes the background, scales the creature to a reference H3
 * creature's size and writes the same atlas + metadata format as
 * build-creature-sprites.mjs, so the hex board animates it like any H3 unit.
 *
 *   node scripts/import-sprite-sheet.mjs <sheet.png> <slug> --grid 8x5
 *     --rows "2:8;0:8;15:8;3:4+4:4;5:8" [--copy "14=15,16=15,12=15"]
 *     [--ref goblin | --ref-image still.png | --height 96] [--faces left] [--tolerance 14]
 *     [--standing 2] [--out-dir public/assets/battle-hex/heroes --meta src/data/battle-hex/hero-sprite-atlases.json]
 *
 * --rows   one entry per sheet row (top to bottom), `;`-separated; each entry is
 *          `group:frames` pieces joined by `+`, read left to right. Groups are the
 *          H3 ids (0 walk, 2 standing, 3 hit, 4 defend, 5 death, 7/8 turn,
 *          11/12/13 attack up/straight/down, 14/15/16 shoot, 17/18/19 cast).
 *          `-` skips cells (e.g. `2:6+-:2`).
 * --copy   reuse a group's frames for another id (`14=15` = shoot-up plays the
 *          straight shot) so every row the board asks for exists.
 * --reverse  a group made of another's frames played backwards (`8=7`: H3's
 *          turn-right is the turn-to-the-viewer row in reverse, after the flip).
 * --ref    scale so the standing body is as tall as that H3 atlas's (default
 *          goblin); --ref-image uses the opaque height of a still (e.g. the
 *          PC creature's standing frame from the wiki); --height sets the body
 *          height in H3 pixels directly.
 * --standing  the group whose first frame is the standing pose used for the
 *          scale and foot anchor (default 2, H3 creatures; hero sheets use 1).
 * --out-dir / --meta  write somewhere else than the creature atlases (hero
 *          battle sprites keep their own atlas file).
 * --faces  the direction the sheet's creature faces (H3 creatures face right;
 *          a left-facing sheet is mirrored).
 * Background: a sheet with real transparency keeps its alpha; otherwise each
 * cell is flood-filled from its border over pixels close to the border colour
 * (--tolerance: largest RGB step between neighbouring background pixels), so a flat or gently graded backdrop drops out.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
sharp.cache(false);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CREATURE_META_FILE = path.join(ROOT, "src", "data", "battle-hex", "creature-sprite-atlases.json");

function option(args, name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

function parseRows(spec) {
  return spec.split(";").map((row) =>
    row.split("+").map((piece) => {
      const [group, count] = piece.split(":");
      return { group: group === "-" ? null : Number(group), count: Number(count) };
    })
  );
}

/** Standing-frame body height (alpha > 128 rows) of an existing H3 atlas. */
async function referenceBodyHeight(slug) {
  const meta = JSON.parse(fs.readFileSync(CREATURE_META_FILE, "utf8"))[slug];
  if (!meta) throw new Error(`--ref ${slug}: no such atlas`);
  const standing = meta.groups["2"] ?? Object.values(meta.groups)[0];
  const file = path.join(ROOT, "public", meta.image);
  // A dense-packed atlas (pack-creature-atlases.mjs) starts the group at cell `start`.
  const cell = standing.start ?? standing.row * meta.columns;
  const { data, info } = await sharp(fs.readFileSync(file))
    .extract({
      left: (cell % meta.columns) * meta.frameWidth,
      top: Math.floor(cell / meta.columns) * meta.frameHeight,
      width: meta.frameWidth,
      height: meta.frameHeight
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let top = -1;
  for (let y = 0; y < info.height && top < 0; y += 1) {
    for (let x = 0; x < info.width; x += 1) if (data[(y * info.width + x) * 4 + 3] > 128) { top = y; break; }
  }
  return meta.anchorY - top;
}

function removeBackground(rgba, width, height, cellWidth, cellHeight, tolerance) {
  // Real transparency present: keep it.
  let clear = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 16) clear += 1;
  if (clear > rgba.length / 4 / 10) return;
  const columns = Math.round(width / cellWidth);
  const rows = Math.round(height / cellHeight);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x0 = column * cellWidth;
      const y0 = row * cellHeight;
      const seen = new Uint8Array(cellWidth * cellHeight);
      const stack = [];
      const index = (x, y) => ((y0 + y) * width + x0 + x) * 4;
      const push = (x, y) => {
        if (x < 0 || y < 0 || x >= cellWidth || y >= cellHeight || seen[y * cellWidth + x]) return;
        seen[y * cellWidth + x] = 1;
        stack.push([x, y]);
      };
      for (let x = 0; x < cellWidth; x += 1) { push(x, 0); push(x, cellHeight - 1); }
      for (let y = 0; y < cellHeight; y += 1) { push(0, y); push(cellWidth - 1, y); }
      // Flood from the border; each step compares with the neighbour it came
      // from, so a slow gradient / vignette is followed but the creature's
      // edge (a sharp colour jump) stops it.
      const reference = new Map();
      for (const [x, y] of stack) reference.set(y * cellWidth + x, index(x, y));
      while (stack.length > 0) {
        const [x, y] = stack.pop();
        const here = index(x, y);
        const from = reference.get(y * cellWidth + x) ?? here;
        const distance = Math.hypot(rgba[here] - rgba[from], rgba[here + 1] - rgba[from + 1], rgba[here + 2] - rgba[from + 2]);
        if (distance > tolerance) continue;
        rgba[here + 3] = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= cellWidth || ny >= cellHeight || seen[ny * cellWidth + nx]) continue;
          reference.set(ny * cellWidth + nx, here);
          push(nx, ny);
        }
      }
    }
  }
}

/** Opaque (alpha > 128) height of a still image — a PC standing frame. */
async function stillBodyHeight(file) {
  const { data, info } = await sharp(fs.readFileSync(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let top = -1, bottom = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] > 128) { if (top < 0) top = y; bottom = y; break; }
    }
  }
  if (top < 0) throw new Error(`--ref-image ${file}: fully transparent`);
  return bottom - top + 1;
}

async function main() {
  const args = process.argv.slice(2);
  const OUT_DIR = path.resolve(ROOT, option(args, "out-dir", path.join("public", "assets", "battle-hex", "creatures")));
  const META_FILE = path.resolve(ROOT, option(args, "meta", CREATURE_META_FILE));
  const publicPrefix = "/" + path.relative(path.join(ROOT, "public"), OUT_DIR).split(path.sep).join("/");
  const standingGroup = Number(option(args, "standing", "2"));
  const [sheetPath, slug] = args;
  const gridSpec = option(args, "grid");
  const rowSpec = option(args, "rows");
  if (!sheetPath || !slug || !/^[a-z0-9-]+$/.test(slug) || !gridSpec || !rowSpec) {
    console.error('usage: node scripts/import-sprite-sheet.mjs <sheet.png> <slug> --grid 8x5 --rows "2:8;0:8;..." [--copy 14=15] [--ref goblin|--height N] [--faces left] [--tolerance 14]');
    process.exit(1);
  }
  const [gridColumns, gridRows] = gridSpec.split("x").map(Number);
  const rows = parseRows(rowSpec);
  if (rows.length !== gridRows) throw new Error(`--rows has ${rows.length} rows, --grid says ${gridRows}`);
  const tolerance = Number(option(args, "tolerance", "14"));
  const mirror = option(args, "faces", "right") === "left";

  const { data, info } = await sharp(fs.readFileSync(sheetPath)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cellWidth = Math.floor(info.width / gridColumns);
  const cellHeight = Math.floor(info.height / gridRows);
  removeBackground(data, info.width, info.height, cellWidth, cellHeight, tolerance);

  // Cut every cell (in cell coordinates, so the sheet's shared baseline stays put).
  const groups = new Map();
  rows.forEach((pieces, row) => {
    let column = 0;
    for (const piece of pieces) {
      for (let k = 0; k < piece.count; k += 1, column += 1) {
        if (piece.group === null) continue;
        const pixels = Buffer.alloc(cellWidth * cellHeight * 4);
        for (let y = 0; y < cellHeight; y += 1) {
          const from = ((row * cellHeight + y) * info.width + column * cellWidth) * 4;
          data.copy(pixels, y * cellWidth * 4, from, from + cellWidth * 4);
        }
        if (!groups.has(piece.group)) groups.set(piece.group, []);
        groups.get(piece.group).push(pixels);
      }
    }
    if (column !== gridColumns) throw new Error(`row ${row + 1} lists ${column} cells, the grid has ${gridColumns}`);
  });
  for (const pair of (option(args, "reverse", "") || "").split(",").filter(Boolean)) {
    const [to, from] = pair.split("=").map(Number);
    if (!groups.has(from)) throw new Error(`--reverse ${pair}: group ${from} has no frames`);
    if (groups.has(to)) throw new Error(`--reverse ${pair}: group ${to} already has its own frames`);
    groups.set(to, [...groups.get(from)].reverse());
  }
  // Copies share the source group's atlas row (no duplicated pixels).
  const aliases = new Map();
  for (const pair of (option(args, "copy", "") || "").split(",").filter(Boolean)) {
    const [to, from] = pair.split("=").map(Number);
    if (!groups.has(from)) throw new Error(`--copy ${pair}: group ${from} has no frames`);
    if (groups.has(to)) throw new Error(`--copy ${pair}: group ${to} already has its own frames`);
    aliases.set(to, from);
  }
  if (!groups.has(standingGroup)) throw new Error(`the sheet needs a standing row (group ${standingGroup})`);

  // Scale: standing body height -> the reference creature's.
  const bodyRows = (pixels) => {
    let top = -1, bottom = -1;
    for (let y = 0; y < cellHeight; y += 1) {
      for (let x = 0; x < cellWidth; x += 1) {
        if (pixels[(y * cellWidth + x) * 4 + 3] > 128) { if (top < 0) top = y; bottom = y; break; }
      }
    }
    return { top, bottom };
  };
  const standing = bodyRows(groups.get(standingGroup)[0]);
  if (standing.top < 0) throw new Error("the first standing frame is empty (background removal took the creature?)");
  const heightArg = option(args, "height");
  const refImage = option(args, "ref-image");
  const target = heightArg
    ? Number(heightArg)
    : refImage
      ? await stillBodyHeight(path.resolve(ROOT, refImage))
      : await referenceBodyHeight(option(args, "ref", "goblin"));
  const scale = target / (standing.bottom - standing.top + 1);

  // Union bounding box over all frames (cell coordinates).
  let minX = cellWidth, minY = cellHeight, maxX = -1, maxY = -1;
  for (const frames of groups.values()) {
    for (const pixels of frames) {
      for (let y = 0; y < cellHeight; y += 1) {
        for (let x = 0; x < cellWidth; x += 1) {
          if (pixels[(y * cellWidth + x) * 4 + 3] > 24) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
    }
  }
  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  const frameWidth = Math.max(1, Math.round(cropWidth * scale));
  const frameHeight = Math.max(1, Math.round(cropHeight * scale));

  // Foot anchor: bottom of the standing body, centred on its lowest quarter
  // (both feet of a biped; the spread legs / tentacles of anything else).
  const first = groups.get(standingGroup)[0];
  let footMin = cellWidth, footMax = -1;
  const footBand = Math.max(10, Math.round((standing.bottom - standing.top + 1) / 4));
  for (let y = Math.max(0, standing.bottom - footBand); y <= standing.bottom; y += 1) {
    for (let x = 0; x < cellWidth; x += 1) {
      if (first[(y * cellWidth + x) * 4 + 3] > 128) { footMin = Math.min(footMin, x); footMax = Math.max(footMax, x); }
    }
  }
  let anchorX = Math.round((((footMin + footMax) / 2) - minX) * scale);
  const anchorY = Math.round((standing.bottom - minY) * scale);
  if (mirror) anchorX = frameWidth - anchorX;

  const ordered = [...groups.keys()].sort((a, b) => a - b);
  const rowOf = new Map(ordered.map((id, row) => [id, row]));
  const columns = Math.max(...ordered.map((id) => groups.get(id).length));
  const composites = [];
  for (const [row, id] of ordered.entries()) {
    for (const [column, pixels] of groups.get(id).entries()) {
      let frame = sharp(pixels, { raw: { width: cellWidth, height: cellHeight, channels: 4 } })
        .extract({ left: minX, top: minY, width: cropWidth, height: cropHeight })
        .resize(frameWidth, frameHeight, { kernel: "lanczos3" });
      if (mirror) frame = frame.flop();
      composites.push({ input: await frame.png().toBuffer(), left: column * frameWidth, top: row * frameHeight });
    }
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `${slug}.webp`);
  const image = await sharp({
    create: { width: columns * frameWidth, height: ordered.length * frameHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite(composites)
    .webp({ quality: 80, alphaQuality: 85, effort: 6, smartSubsample: true })
    .toBuffer();
  fs.writeFileSync(outFile, image);

  const meta = fs.existsSync(META_FILE) ? JSON.parse(fs.readFileSync(META_FILE, "utf8")) : {};
  meta[slug] = {
    image: `${publicPrefix}/${slug}.webp`,
    frameWidth,
    frameHeight,
    columns,
    anchorX,
    anchorY,
    groups: Object.fromEntries(
      [...ordered, ...aliases.keys()]
        .sort((a, b) => a - b)
        .map((id) => {
          const source = aliases.get(id) ?? id;
          return [String(id), { row: rowOf.get(source), frames: groups.get(source).length }];
        })
    )
  };
  const sorted = Object.fromEntries(Object.keys(meta).sort().map((key) => [key, meta[key]]));
  fs.writeFileSync(META_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`${slug}: ${columns}x${ordered.length} frames of ${frameWidth}x${frameHeight} (scale ${scale.toFixed(3)}, body ${target}px), anchor (${anchorX}, ${anchorY}), ${image.length} bytes -> ${path.relative(ROOT, outFile)}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Builds the Factory (S10), Bulwark (S11) and Forge (S12) starting-tile art.
 *
 * Codex paints ONLY the terrain scene (no lines, text or icons) from a layout
 * guide; everything printed is drawn here so it always matches the engine:
 *  - the pointy-top 7-hex flower mask (engine art box 3√3 : 5, R = H / 5),
 *  - a complete solid yellow ring around the blocked field + its tile label,
 *  - solid three-edge outer arcs on the sealed ring fields,
 *  - dashed separators between passable fields,
 *  - the printed field symbols (guard Ⅰ, ↻2 + materials, chest, tools).
 *
 * Official starting-tile rule (S1–S9): the blocked field and the three ring
 * fields OPPOSITE it are sealed; the two ring fields beside the blocked field
 * keep open outer approaches. `sealedDirections()` derives that from the
 * blocked slot, and must agree with `outerImpassable` in
 * src/data/map/expansion-tiles.ts.
 *
 * Usage:
 *   node scripts/build-expansion-starting-tiles.mjs guides   # layout guides for Codex
 *   node scripts/build-expansion-starting-tiles.mjs build    # composite finals
 * Inputs/outputs: generated-session-art/starting-tiles/<id>-{guide,base}.png,
 * public/assets/board/tiles/<id>.webp
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artDir = path.join(root, "generated-session-art", "starting-tiles");

const W = 1024;
const H = Math.round((W * 5) / (3 * Math.sqrt(3))); // 985
const R = H / 5;
const HALF_W = (Math.sqrt(3) / 2) * R;
const CX = W / 2;
const CY = H / 2;

// Slot 0 = centre, 1-6 = NE, E, SE, SW, W, NW (rotation 0, as in the engine).
const DIR_ANGLE = [null, -60, 0, 60, 120, 180, 240];
const center = (slot) => {
  if (slot === 0) return { x: CX, y: CY };
  const a = (DIR_ANGLE[slot] * Math.PI) / 180;
  return { x: CX + Math.cos(a) * 2 * HALF_W, y: CY + Math.sin(a) * 2 * HALF_W };
};
const vertices = (c) =>
  Array.from({ length: 6 }, (_, k) => {
    const a = ((-90 + 60 * k) * Math.PI) / 180;
    return { x: c.x + Math.cos(a) * R, y: c.y + Math.sin(a) * R };
  });
/** Edge of hex `c` facing direction d (1-6). */
const edge = (c, d) => {
  const v = vertices(c);
  return [v[d - 1], v[d % 6]];
};
const wrap = (d) => ((((d - 1) % 6) + 6) % 6) + 1;
export const sealedDirections = (blocked) => [blocked, wrap(blocked + 2), wrap(blocked + 3), wrap(blocked + 4)];

const TILES = {
  s10: {
    label: "S10",
    // Factory: NE mine, E resource, SE empty, SW treasure, W empty, NW blocked.
    slots: [null, "mine", "resource", "empty", "treasure", "empty", "blocked"],
    scene: {
      0: "the FACTORY town: a sandstone domed foundry with four white minaret smokestacks, walls and a courtyard",
      1: "an open-pit ore mine with a mine cart full of ore and grey stone piles",
      2: "a small campfire ring among desert scrub and a gnarled dead tree",
      3: "open sand with a dead tree, small cacti and tufts of desert grass",
      4: "an abandoned wooden treasure cart with crates beside the road",
      5: "cracked dry ground with a deep crack, dead shrubs and cacti",
      6: "IMPASSABLE jagged sandstone crags and broken rock ledges (no path through)"
    },
    terrain: "sun-baked orange desert sand with faint pale dirt roads linking every area to the town",
  },
  s11: {
    label: "S11",
    // Bulwark: NE treasure, E blocked, SE mine, SW empty, W empty, NW resource.
    slots: [null, "treasure", "blocked", "mine", "empty", "empty", "resource"],
    scene: {
      0: "the BULWARK town: a grim dark-grey stone dwarven fortress with three tall square towers on a snowy rock",
      1: "a wooden sledge-cart with barrels and bundles among frosted bare trees",
      2: "IMPASSABLE wall of jagged blue glacier ice and frozen crevasses (no path through)",
      3: "a mine entrance dug into a snowy hillside with an ore cart of dark ore",
      4: "a grove of tall frost-covered bare trees",
      5: "snowfield with a stand of frosted pines and dead trees",
      6: "a crackling campfire in the snow beside a few snowy rocks"
    },
    terrain: "deep white-blue snow with faint trodden paths linking every area to the fortress",
  },
  s12: {
    label: "S12",
    // Forge: NE empty, E treasure, SE blocked, SW resource, W empty, NW mine.
    slots: [null, "empty", "treasure", "blocked", "resource", "empty", "mine"],
    scene: {
      0: "the FORGE town: a tall pale-grey industrial stone citadel of stepped towers and a gatehouse on a crag",
      1: "ash plain with a few jagged dark rock spires",
      2: "a wooden cart loaded with gold and supplies beside a pile of dark ore",
      3: "IMPASSABLE forest of tall black jagged rock spires and dead trees (no path through)",
      4: "a campfire burning on the ash near a low rocky ridge",
      5: "grey ash waste with scattered rocks and a dead shrub",
      6: "an open-pit mine with a timber head-frame, an ore cart and a stone pile"
    },
    terrain: "dark grey volcanic ash wasteland dusted with pale ash, faint pale paths linking every area to the citadel",
  }
};

// Border cream sampled from the Castle S3 scan (brightest ring pixel 225,227,213).
const LINE = "#e4e1cc";
const LINE_DARK = "#2a1d0a";

function flowerMaskSvg() {
  const polys = [0, 1, 2, 3, 4, 5, 6]
    .map((s) => `<polygon points="${vertices(center(s)).map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")}" fill="#fff"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${polys}</svg>`;
}

function line(a, b, width, color, dash = "") {
  return `<line x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}" stroke="${color}" stroke-width="${width}" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
}

/** Every printed line: solid ring + sealed arcs (outer edges drawn double width, clipped by the mask later), dashed separators. */
function linesSvg(tile) {
  const blocked = tile.slots.indexOf("blocked");
  const sealed = new Set(sealedDirections(blocked));
  const solid = [];
  const dashed = [];
  const seen = new Set();
  const key = (a, b) => [a, b].map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).sort().join("|");
  for (let s = 1; s <= 6; s += 1) {
    const c = center(s);
    for (let d = 1; d <= 6; d += 1) {
      const [a, b] = edge(c, d);
      const k = key(a, b);
      if (seen.has(k)) continue;
      seen.add(k);
      const outer = d === wrap(s - 1) || d === s || d === wrap(s + 1);
      if (outer) {
        if (sealed.has(s)) solid.push({ a, b, outer: true });
      } else if (s === blocked || (d === wrap(s + 3) ? false : tile.slots[neighbourSlot(s, d)] === "blocked")) {
        solid.push({ a, b, outer: false });
      } else {
        dashed.push({ a, b });
      }
    }
  }
  // Centre ↔ ring edges (the loop above only saw them from the ring side when s's d+3 edge).
  for (let s = 1; s <= 6; s += 1) {
    const [a, b] = edge(center(0), s);
    const k = key(a, b);
    if (seen.has(k)) continue;
    seen.add(k);
    if (s === blocked) solid.push({ a, b, outer: false });
    else dashed.push({ a, b });
  }
  const T = 9; // printed ring width at 1024 px
  const shadow = [
    ...solid.map((e) => line(e.a, e.b, (e.outer ? 2 * T : T) + 3, LINE_DARK)),
  ].join("");
  const body = solid.map((e) => line(e.a, e.b, e.outer ? 2 * T : T, LINE)).join("");
  // Thin pale dashes like the S3 print; a faint keyline keeps them visible on snow.
  const dashKey = dashed.map((e) => line(e.a, e.b, 4.5, LINE_DARK, "14 10")).join("");
  const dash = dashed.map((e) => line(e.a, e.b, 2.5, LINE, "14 10")).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><g opacity="0.25">${shadow}</g><g opacity="0.35">${dashKey}</g>${dash}${body}</svg>`;
}

/** Ring slot reached from ring slot s through its edge d, or 0 (centre) / -1 (outside). */
function neighbourSlot(s, d) {
  const c = center(s);
  const a = (DIR_ANGLE[d] * Math.PI) / 180;
  const p = { x: c.x + Math.cos(a) * 2 * HALF_W, y: c.y + Math.sin(a) * 2 * HALF_W };
  for (let t = 0; t <= 6; t += 1) {
    const q = center(t);
    if (Math.hypot(q.x - p.x, q.y - p.y) < 5) return t;
  }
  return -1;
}

function textSvg(text, x, y, size, { fill = "#f6ecd0", stroke = "#1a1006" } = {}) {
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-family="'Times New Roman', Times, serif" font-size="${size}" font-weight="700" fill="${fill}" stroke="${stroke}" stroke-width="${Math.max(3, size * 0.07)}" paint-order="stroke">${text}</text>`;
}

/**
 * The REAL printed field glyphs, cut from the Castle starting-tile scan S3
 * (same 1024 px scale as these tiles): guard "Ⅰ", mine "↻2 + materials",
 * treasure chest, resource tools. Boxes are in s3.webp pixels.
 */
const S3_GLYPHS = {
  guard: { left: 140, top: 335, width: 60, height: 70 },
  mine: { left: 280, top: 845, width: 140, height: 62 },
  treasure: { left: 125, top: 545, width: 80, height: 70 },
  resource: { left: 815, top: 530, width: 80, height: 80 }
};

/**
 * Key a printed glyph out of the scan's grass: pale, unsaturated pixels are ink
 * (cream icons, silver numeral); a small closing keeps the dark engraved lines
 * inside the chest; green fill-ins and specks off the central glyph are dropped.
 */
async function scanGlyph(box) {
  const { data, info } = await sharp(path.join(root, "public/assets/board/tiles/s3.webp"))
    .extract(box)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const px = (x, y) => [data[(y * w + x) * 3], data[(y * w + x) * 3 + 1], data[(y * w + x) * 3 + 2]];
  const ink = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const [r, g, b] = px(x, y);
      const L = (r + g + b) / 3;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      ink[y * w + x] = (L > 150 && sat < 72 && g <= r + 6) || (L > 118 && sat < 22) ? 1 : 0;
    }
  }
  const morph = (src, dilate) => {
    const dst = new Uint8Array(w * h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        let hit = !dilate;
        for (let dy = -2; dy <= 2 && hit !== dilate; dy += 1) {
          for (let dx = -2; dx <= 2; dx += 1) {
            const v = src[Math.min(h - 1, Math.max(0, y + dy)) * w + Math.min(w - 1, Math.max(0, x + dx))];
            if (dilate ? v : !v) { hit = dilate; break; }
          }
        }
        dst[y * w + x] = hit ? 1 : 0;
      }
    }
    return dst;
  };
  const closed = morph(morph(ink, true), false);
  // Keep only connected parts that are real glyph strokes (drops grass specks).
  const label = new Int32Array(w * h).fill(-1);
  const keep = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    if (!closed[i] || label[i] >= 0) continue;
    const stack = [i];
    const members = [];
    label[i] = i;
    while (stack.length) {
      const j = stack.pop();
      members.push(j);
      const x = j % w;
      const y = (j - x) / w;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const k = ny * w + nx;
        if (closed[k] && label[k] < 0) { label[k] = i; stack.push(k); }
      }
    }
    if (members.length >= 40) for (const j of members) keep[j] = 1;
  }
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i += 1) {
    const [r, g, b] = [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]];
    const greenFill = !ink[i] && g > r + 8;
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = keep[i] && !greenFill ? 255 : 0;
  }
  // The print's thin dark keyline (what keeps the SX1 snow-tile glyphs legible)
  // plus its faint drop shadow.
  const glyph = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  const pad = 6;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w + pad * 2}" height="${h + pad * 2}">` +
    `<defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%">` +
    `<feMorphology in="SourceAlpha" operator="dilate" radius="1.3" result="d"/><feGaussianBlur in="d" stdDeviation="0.6" result="db"/>` +
    `<feFlood flood-color="#2f3038" flood-opacity="0.8"/><feComposite in2="db" operator="in" result="k"/>` +
    `<feGaussianBlur in="SourceAlpha" stdDeviation="2" result="sb"/><feOffset in="sb" dy="1.5" result="so"/>` +
    `<feFlood flood-color="#000" flood-opacity="0.45"/><feComposite in2="so" operator="in" result="sh"/>` +
    `<feMerge><feMergeNode in="sh"/><feMergeNode in="k"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>` +
    `<image x="${pad}" y="${pad}" width="${w}" height="${h}" xlink:href="data:image/png;base64,${glyph.toString("base64")}" filter="url(#s)"/></svg>`;
  return { input: await sharp(Buffer.from(svg)).png().toBuffer(), width: w + pad * 2, height: h + pad * 2 };
}

/** Tile label in the print's style: pale Times bold with a soft shadow, no outline. */
function labelSvg(text, x, y) {
  return (
    // Same thin keyline as the glyphs, so a label on pale ice stays legible.
    `<defs><filter id="ls" x="-20%" y="-20%" width="140%" height="140%">` +
    `<feMorphology in="SourceAlpha" operator="dilate" radius="1.4" result="d"/><feGaussianBlur in="d" stdDeviation="0.6" result="db"/>` +
    `<feFlood flood-color="#2f3038" flood-opacity="0.8"/><feComposite in2="db" operator="in" result="k"/>` +
    `<feGaussianBlur in="SourceAlpha" stdDeviation="2.5" result="sb"/><feOffset in="sb" dy="2" result="so"/>` +
    `<feFlood flood-color="#000" flood-opacity="0.6"/><feComposite in2="so" operator="in" result="sh"/>` +
    `<feMerge><feMergeNode in="sh"/><feMergeNode in="k"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>` +
    `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-family="'Times New Roman', Times, serif" ` +
    `font-size="52" font-weight="700" fill="#ecebe6" filter="url(#ls)">${text}</text>`
  );
}

/** Field symbols laid out exactly like Castle S3: guard centred above (−0.65 R), icon row centred below (+0.44 R). */
async function symbolComposites(tile) {
  const glyphs = Object.fromEntries(
    await Promise.all(Object.entries(S3_GLYPHS).map(async ([k, box]) => [k, await scanGlyph(box)]))
  );
  const place = (g, x, y) => ({ input: g.input, left: Math.round(x - g.width / 2), top: Math.round(y - g.height / 2) });
  const out = [];
  let texts = "";
  for (let s = 1; s <= 6; s += 1) {
    const kind = tile.slots[s];
    const c = center(s);
    if (kind === "blocked") {
      texts += labelSvg(tile.label, c.x, c.y);
      continue;
    }
    if (kind === "mine" || kind === "treasure") out.push(place(glyphs.guard, c.x, c.y - R * 0.65));
    if (kind === "mine" || kind === "treasure" || kind === "resource") out.push(place(glyphs[kind], c.x, c.y + R * 0.44));
  }
  out.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${texts}</svg>`), left: 0, top: 0 });
  return out;
}

async function buildGuide(id, tile) {
  const colors = { blocked: "#7a2020", mine: "#4a4a70", treasure: "#806020", resource: "#a04a10", empty: "#557040" };
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#111"/>`;
  for (let s = 0; s <= 6; s += 1) {
    const kind = s === 0 ? "town" : tile.slots[s];
    const c = center(s);
    svg += `<polygon points="${vertices(c).map((p) => `${p.x},${p.y}`).join(" ")}" fill="${colors[kind] ?? "#707070"}" stroke="#fff" stroke-width="3"/>`;
    svg += textSvg(kind.toUpperCase(), c.x, c.y, 34);
  }
  svg += "</svg>";
  fs.mkdirSync(artDir, { recursive: true });
  const file = path.join(artDir, `${id}-guide.png`);
  await sharp(Buffer.from(svg)).png().toFile(file);
  console.log(`guide ${path.relative(root, file)}`);
}

async function buildTile(id, tile) {
  const base = path.join(artDir, `${id}-${process.env.TILE_BASE ?? "base"}.png`);
  if (!fs.existsSync(base)) throw new Error(`missing ${path.relative(root, base)}`);
  const painted = await sharp(base).resize(W, H, { fit: "fill" }).png().toBuffer();
  const lines = Buffer.from(linesSvg(tile));
  const flat = await sharp(painted)
    .composite([{ input: lines }, ...(await symbolComposites(tile))])
    .png()
    .toBuffer();
  const mask = Buffer.from(flowerMaskSvg());
  const out = path.join(process.env.TILE_OUT_DIR ?? path.join(root, "public", "assets", "board", "tiles"), `${id}.webp`);
  await sharp(flat)
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }])
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toFile(out);
  const meta = await sharp(out).metadata();
  console.log(`tile ${path.relative(root, out)} ${meta.width}x${meta.height} alpha=${meta.hasAlpha} sealed=${sealedDirections(tile.slots.indexOf("blocked"))}`);
}

const mode = process.argv[2];
const only = process.argv[3];
for (const [id, tile] of Object.entries(TILES)) {
  if (only && only !== id) continue;
  if (mode === "guides") await buildGuide(id, tile);
  else if (mode === "build") await buildTile(id, tile);
  else {
    console.error("usage: node scripts/build-expansion-starting-tiles.mjs <guides|build> [s10|s11|s12]");
    process.exit(1);
  }
}

export { TILES };

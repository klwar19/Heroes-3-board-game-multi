// Builds the printed-style town boards for the DESIGNED face boards (Factory,
// Forge, Bulwark) in the physical Archon format (see the Castle scans):
//
//  - <faction>-board-empty.webp: the whole empty board face. The townscape
//    shows NO name/cost plaques: the board view draws each unbuilt building's
//    live name + cost plate itself (two stacked plates on the shared bar), so a
//    built slot never shows a cost.
//  - <faction>-built-<1..7>.webp: the seven built tiles, aligned crops of the
//    fully-built townscape at the exact bar rectangles of the board geometry
//    (src/data/towns/boards.ts). The round green building icons are overlaid
//    by the view (public/factory-cards/town-board/icon-*.webp, cut from the
//    real Castle scan), so a half-built shared tile can grey out its missing
//    building.
//
// Art sources (Codex painted ART ONLY — frames/icons/text come from the real
// board components or from code):
//  - Factory/Forge: the existing faces, with the seven blank green plaques
//    repainted away by Codex image edits (tmp/gen/board-plaques/*-clean.png,
//    masters copied to generated-session-art/<faction>/board/). Only the
//    plaque rectangles are taken from the Codex output (feathered), every
//    other pixel stays the original art, so empty face and built tiles stay
//    pixel-aligned.
//  - Bulwark: the Factory face's generic frame + printed bottom half with the
//    Bulwark unbuilt panorama in the townscape window, slot outlines redrawn,
//    and built tiles cut from the matching fully-built panorama tiles.
//
// Usage: node scripts/build-town-board-print.mjs
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public/factory-cards/town-board");
const GEN = path.join(ROOT, "generated-session-art");
fs.mkdirSync(OUT, { recursive: true });

// Board window geometry (must mirror FACTORY_GEOMETRY / FORGE_GEOMETRY).
const FACTORY_WINDOW = { w: 1470, h: 1070, left: 61, top: 86, bottom: 508, pitch: (1408 - 61) / 7 };
const FORGE_WINDOW = { w: 1536, h: 1024, left: 0.0373 * 1536, top: 0.0682 * 1024, bottom: 0.4748 * 1024, pitch: 0.1327 * 1536 };

function barRects(win) {
  return Array.from({ length: 7 }, (_, i) => {
    const left = Math.round(win.left + i * win.pitch);
    const right = Math.round(win.left + (i + 1) * win.pitch);
    const top = Math.round(win.top);
    return { left, top, width: right - left, height: Math.round(win.bottom) - top };
  });
}

/** Bounding boxes of the blank green plaques in the townscape band. */
async function findPlaques(file, yMax) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const green = (x, y) => {
    const i = (y * W + x) * 3;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    return g > 60 && g > r * 1.4 && g > b * 1.25;
  };
  const cols = [];
  for (let x = 0; x < W; x++) {
    let c = 0;
    for (let y = 0; y < yMax; y++) if (green(x, y)) c++;
    cols.push(c);
  }
  const runs = [];
  let start = -1;
  for (let x = 0; x <= W; x++) {
    const on = x < W && cols[x] > 8;
    if (on && start < 0) start = x;
    if (!on && start >= 0) {
      if (x - start > 20) runs.push([start, x - 1]);
      start = -1;
    }
  }
  return runs.map(([a, b]) => {
    let y0 = Infinity, y1 = 0;
    for (let y = 0; y < yMax; y++) {
      let c = 0;
      for (let x = a; x <= b; x++) if (green(x, y)) c++;
      if (c > (b - a) * 0.5) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    return { x0: a, x1: b, y0, y1 };
  });
}

/** Original art with only the (expanded, feathered) plaque rectangles taken
 *  from the Codex repaint. */
async function patchPlaques(origFile, cleanFile, plaques, { margin = 18, feather = 5, deghost = false } = {}) {
  const meta = await sharp(origFile).metadata();
  const { width: W, height: H } = meta;
  let clean = await sharp(cleanFile).resize(W, H, { fit: "fill" }).removeAlpha().png().toBuffer();
  if (deghost) {
    // Codex sometimes leaves a faint outline where each plaque border was:
    // soften a thin band along exactly that border in its repaint.
    const border = plaques
      .map(({ x0, x1, y0, y1 }) => `<rect x="${x0 - 5}" y="${y0 - 5}" width="${x1 - x0 + 10}" height="${y1 - y0 + 10}" rx="3" fill="none" stroke="#fff" stroke-width="9"/>`)
      .join("");
    const band = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#000"/>${border}</svg>`))
      .blur(2)
      .extractChannel(0)
      .toBuffer();
    const soft = await sharp(clean).blur(5).joinChannel(band).png().toBuffer();
    clean = await sharp(clean).composite([{ input: soft }]).png().toBuffer();
  }
  const rects = plaques
    .map(({ x0, x1, y0, y1 }) => `<rect x="${x0 - margin}" y="${y0 - margin}" width="${x1 - x0 + 2 * margin}" height="${y1 - y0 + 2 * margin}" rx="4" fill="#fff"/>`)
    .join("");
  const mask = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#000"/>${rects}</svg>`))
    .blur(feather)
    .extractChannel(0)
    .toBuffer();
  const patch = await sharp(clean).joinChannel(mask).png().toBuffer();
  return sharp(origFile).removeAlpha().composite([{ input: patch }]).png().toBuffer();
}

async function writeBoard(faction, emptyPng, fullPng, win) {
  await sharp(emptyPng).webp({ quality: 90 }).toFile(path.join(OUT, `${faction}-board-empty.webp`));
  const rects = barRects(win);
  for (const [i, rect] of rects.entries()) {
    await sharp(fullPng).extract(rect).webp({ quality: 90 }).toFile(path.join(OUT, `${faction}-built-${i + 1}.webp`));
  }
  console.log(faction, "board + 7 built tiles", rects.map((r) => `${r.width}x${r.height}`).join(" "));
}

async function buildForge() {
  const dir = path.join(GEN, "forge/board");
  const plaques = await findPlaques(path.join(dir, "forge-board-empty.png"), 300);
  if (plaques.length !== 7) throw new Error(`forge: expected 7 plaques, found ${plaques.length}`);
  const fullPlaques = await findPlaques(path.join(dir, "forge-board-full.png"), 300);
  const empty = await patchPlaques(path.join(dir, "forge-board-empty.png"), path.join(dir, "forge-board-empty-clean.png"), plaques);
  const full = await patchPlaques(path.join(dir, "forge-board-full.png"), path.join(dir, "forge-board-full-clean.png"), fullPlaques);
  await writeBoard("forge", empty, full, FORGE_WINDOW);
  return { empty, full };
}

async function buildFactory() {
  // Masters are the shipped faces padded to 3:2 (1605x1070) for the Codex edit.
  const dir = path.join(GEN, "factory/board");
  const crop = (buf) => sharp(buf).extract({ left: 0, top: 0, width: 1470, height: 1070 }).png().toBuffer();
  const plaques = await findPlaques(path.join(dir, "factory-board-empty.png"), 300);
  if (plaques.length !== 7) throw new Error(`factory: expected 7 plaques, found ${plaques.length}`);
  const fullPlaques = await findPlaques(path.join(dir, "factory-board-full.png"), 300);
  const empty = await crop(await patchPlaques(path.join(dir, "factory-board-empty.png"), path.join(dir, "factory-board-empty-clean.png"), plaques));
  const full = await crop(await patchPlaques(path.join(dir, "factory-board-full.png"), path.join(dir, "factory-board-full-clean.png"), fullPlaques, { deghost: true }));
  await writeBoard("factory", empty, full, FACTORY_WINDOW);
  return { empty, full };
}

/** Recessed slot outlines of the printed die-cut: seams, slot tops and the
 *  thumb-notch arches, drawn in the Factory face's dark line style. */
function slotOutlineSvg(win) {
  const rects = barRects(win);
  const top = Math.round(win.top);
  const bottom = Math.round(win.bottom);
  const r = 43;
  const parts = [];
  // The raised frame lip above the slot tops, with the arch notches cut out
  // (evenodd holes) so the townscape shows through them as on the print.
  const lipTop = 45;
  const lipRight = rects[6].left + rects[6].width;
  const notches = rects
    .map((rect) => {
      const cx = rect.left + rect.width / 2;
      const dx = Math.sqrt(r * r - 11 * 11);
      return `M ${cx - dx} ${top} A ${r} ${r} 0 0 1 ${cx + dx} ${top} Z`;
    })
    .join(" ");
  parts.push(`<path d="M ${rects[0].left - 16} ${lipTop} H ${lipRight + 16} V ${top} H ${rects[0].left - 16} Z ${notches}" fill="url(#lip)" fill-rule="evenodd"/>`);
  for (const [i, rect] of rects.entries()) {
    const cx = rect.left + rect.width / 2;
    const dx = Math.sqrt(r * r - 11 * 11);
    // slot top edge with the arch notch
    const d = `M ${rect.left} ${top} L ${cx - dx} ${top} A ${r} ${r} 0 0 1 ${cx + dx} ${top} L ${rect.left + rect.width} ${top}`;
    parts.push(`<path d="${d}" fill="none" stroke="#f3e6c4" stroke-opacity="0.28" stroke-width="2" transform="translate(0 1.5)"/>`);
    parts.push(`<path d="${d}" fill="none" stroke="#120d08" stroke-opacity="0.92" stroke-width="3"/>`);
    if (i > 0) {
      parts.push(`<line x1="${rect.left + 1.5}" y1="${top}" x2="${rect.left + 1.5}" y2="${bottom}" stroke="#f3e6c4" stroke-opacity="0.22" stroke-width="1.5"/>`);
      parts.push(`<line x1="${rect.left}" y1="${top}" x2="${rect.left}" y2="${bottom}" stroke="#120d08" stroke-opacity="0.92" stroke-width="3"/>`);
    }
  }
  // outer window edges
  parts.push(`<rect x="${rects[0].left}" y="${top}" width="${rects[6].left + rects[6].width - rects[0].left}" height="${bottom - top}" fill="none" stroke="#120d08" stroke-opacity="0.9" stroke-width="3"/>`);
  // inner shadow along the slot tops (the recess)
  parts.push(`<rect x="${rects[0].left}" y="${top}" width="${rects[6].left + rects[6].width - rects[0].left}" height="14" fill="url(#recess)"/>`);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${win.w}" height="${win.h}"><defs><linearGradient id="lip" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f6fb4" stop-opacity="0.9"/><stop offset="1" stop-color="#1d4a80" stop-opacity="0.82"/></linearGradient><linearGradient id="recess" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.35"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs>${parts.join("")}</svg>`);
}

async function buildBulwark(factoryEmpty) {
  const tb = path.join(ROOT, "public/assets/town-board");
  const unbuilt = path.join(tb, "bulwark-panorama-unbuilt.webp");
  const panoMeta = await sharp(unbuilt).metadata();
  // The townscape area inside the Factory face's blue border.
  const area = { left: 45, top: 45, width: 1470 - 90, height: FACTORY_WINDOW.bottom - 45 };
  const scale = Math.max(area.width / panoMeta.width, area.height / panoMeta.height);
  const scaledW = Math.round(panoMeta.width * scale);
  const scaledH = Math.round(panoMeta.height * scale);
  const offY = Math.round((scaledH - area.height) * 0.35);
  const offX = Math.round((scaledW - area.width) / 2);
  const fit = (input) => sharp(input).resize(scaledW, scaledH).extract({ left: offX, top: offY, width: area.width, height: area.height }).png().toBuffer();
  const outline = slotOutlineSvg(FACTORY_WINDOW);
  const face = async (scene) => sharp(factoryEmpty).composite([{ input: await fit(scene), left: area.left, top: area.top }, { input: outline }]).png().toBuffer();
  const empty = await face(unbuilt);
  // Built tiles in the OFFICIAL Bulwark slot order (City Hall, Citadel, Silver,
  // Gold, Sieidi + Altar, Mage Guild, Bronze): a Codex edit of the unbuilt
  // panorama (letterboxed at 1536x558 inside 1536x1024) painted one building
  // group per seventh — generated-session-art/bulwark/board/bulwark-pano-full.png.
  // Codex placed some groups up to ~65 px off their slot centre, so each tile is
  // cut CENTRED ON ITS BUILDING (like separate physical tiles, a small landscape
  // offset at the tile edge) and gets the printed slot border drawn on it.
  const codexPano = path.join(GEN, "bulwark/board/bulwark-pano-full.png");
  if (!fs.existsSync(codexPano)) throw new Error(`missing ${codexPano}`);
  const pano = await sharp(codexPano).extract({ left: 0, top: 233, width: 1536, height: 558 }).resize(panoMeta.width, panoMeta.height, { fit: "fill" }).png().toBuffer();
  const scene = await sharp(factoryEmpty).composite([{ input: await fit(pano), left: area.left, top: area.top }]).png().toBuffer();
  // Building-group centres measured on the Codex panorama (x in its 2079 px width).
  const buildingCentres = [148, 490, 846, 1129, 1403, 1685, 1931];
  // Final natural-look pass: Codex repainted this composited empty face so the
  // drawn slot outlines, notches and frame lip read as a printed die-cut
  // (verified pixel-aligned: window drift < 1/255, bottom half identical).
  const finalFace = path.join(GEN, "bulwark/board/bulwark-face-final.png");
  const emptyOut = fs.existsSync(finalFace)
    ? await sharp(finalFace).resize(1605, 1070, { fit: "fill" }).extract({ left: 0, top: 0, width: 1470, height: 1070 }).png().toBuffer()
    : empty;
  await sharp(emptyOut).webp({ quality: 90 }).toFile(path.join(OUT, "bulwark-board-empty.webp"));
  const rects = barRects(FACTORY_WINDOW);
  for (const [i, rect] of rects.entries()) {
    const centre = area.left + buildingCentres[i] * scale - offX;
    const minLeft = area.left;
    const maxLeft = area.left + area.width - rect.width;
    const left = Math.max(minLeft, Math.min(maxLeft, Math.round(centre - rect.width / 2)));
    const border = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${rect.width}" height="${rect.height}"><rect x="1.5" y="1.5" width="${rect.width - 3}" height="${rect.height - 3}" fill="none" stroke="#120d08" stroke-opacity="0.92" stroke-width="3"/><rect x="3.5" y="3.5" width="${rect.width - 7}" height="${rect.height - 7}" fill="none" stroke="#f3e6c4" stroke-opacity="0.18" stroke-width="1.2"/></svg>`);
    await sharp(scene)
      .extract({ left, top: rect.top, width: rect.width, height: rect.height })
      .composite([{ input: border }])
      .webp({ quality: 90 })
      .toFile(path.join(OUT, `bulwark-built-${i + 1}.webp`));
  }
  console.log("bulwark board + 7 built tiles (building-centred)");

}

const only = process.argv[2];
if (!only || only === "forge") await buildForge();
if (!only || only === "factory" || only === "bulwark") {
  const factory = await buildFactory();
  if (!only || only === "bulwark") await buildBulwark(factory.empty);
}

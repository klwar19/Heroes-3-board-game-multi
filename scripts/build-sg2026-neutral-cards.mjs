#!/usr/bin/env node
/**
 * Stretch Goals 2026 neutral cards (Gamefound WIP cards 099 Clockwork Dwarves,
 * 101 Mermaids) built on a REAL printed Stretch Goals card of the same tier and
 * unit type, so frame, bars, rail, panel and footer are the printed ones:
 *
 *   Clockwork Dwarves  <- units-neutral-bronze-leprechaun.webp   (bronze, ground)
 *   Mermaids           <- units-neutral-silver-steel_golems.webp (silver, ground)
 *
 * Every replaced element is re-lettered in the printed style, measured from the
 * template scan itself (no guessed sizes):
 *  - ART: the HD Codex remaster (scripts/neutral-unit-art/<slug>.png) fills the
 *    art window found between the window's border lines; the printed type glyph
 *    is keyed out of the template (its exact shape) and stamped back on top.
 *  - TITLE: the old title is erased with the bar's own clean texture (ping-pong
 *    tiling of the clean band beside it, row by row) and re-set in Times New
 *    Roman Bold at the printed cap size / colour, centred like the print.
 *  - STATS / COST: each changed numeral is erased (mirror fill from its own row)
 *    and re-set in Times New Roman Bold at the printed numeral height/colour.
 *  - PANEL: the printed rules text is removed by registering the EMPTY panel of
 *    an official same-tier neutral card (Boars / Demons: identical frame) into
 *    the template's panel, colour-matched to the template's own clean panel rows.
 *    The rules text is re-set in the printed Times New Roman at the size measured
 *    from the template's rules line, glyph icons inline with REAL measured text
 *    advances (librsvg render), centred line by line.
 *  - FOOTER: the collector number and the © years are re-set in Segoe UI at the
 *    printed footer height.
 *
 *   node scripts/build-sg2026-neutral-cards.mjs [--preview out.png]
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = path.join(ROOT, "public", "assets");
const GLYPHS = path.join(ROOT, "scripts", "card-glyphs");
const ART = path.join(ROOT, "scripts", "neutral-unit-art");

const CARDS = [
  {
    slug: "clockwork_dwarves", tier: "bronze", name: "Clockwork Dwarves",
    template: "units-neutral-bronze-leprechaun.webp",
    panelSource: "units-neutral-bronze-boars.webp",
    stats: [1, 1, 3, 3], cost: 4,
    footer: { number: "099/227", year: "2026" },
    lines: [
      [{ glyph: "unit_attack" }, " Deal 1 ", { glyph: "damage" }, " to all adjacent enemy"],
      ["Units and remove all ", { glyph: "damage" }, " from this Unit."]
    ]
  },
  {
    slug: "mermaids", tier: "silver", name: "Mermaids",
    template: "units-neutral-silver-steel_golems.webp",
    panelSource: "units-neutral-silver-demons.webp",
    stats: [3, 1, 4, 5], cost: 8,
    footer: { number: "101/228", year: "2026" },
    lines: [
      [{ glyph: "unit_passive" }, " Enemy units have -1 ", { glyph: "attack" }, " during ", { glyph: "unit_retaliation" }, "."]
    ]
  }
];

// Printed values on the templates (to know which numerals change).
const TEMPLATE_VALUES = {
  "units-neutral-bronze-leprechaun.webp": { stats: [2, 0, 3, 5], cost: 4, title: "Leprechaun", rules: "the higher one.", footerNumber: "074/197" },
  "units-neutral-silver-steel_golems.webp": { stats: [3, 2, 3, 5], cost: 12, title: "Steel Golems", rules: "or Specialty by 2—to a minimum of 0.", footerNumber: "079/197" }
};

const TITLE_FONT = "Times New Roman";
const FOOTER_FONT = "Segoe UI";

// ---------------------------------------------------------------- raw image
class Raw {
  constructor(data, width, height) { this.data = data; this.width = width; this.height = height; }
  static async load(file) {
    const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    return new Raw(Buffer.from(data), info.width, info.height);
  }
  idx(x, y) { return (y * this.width + x) * 3; }
  get(x, y) { const i = this.idx(x, y); return [this.data[i], this.data[i + 1], this.data[i + 2]]; }
  set(x, y, p) { const i = this.idx(x, y); this.data[i] = p[0]; this.data[i + 1] = p[1]; this.data[i + 2] = p[2]; }
  lum(x, y) { const [r, g, b] = this.get(x, y); return r * 0.3 + g * 0.59 + b * 0.11; }
  sharp() { return sharp(this.data, { raw: { width: this.width, height: this.height, channels: 3 } }); }
}

const median = (values) => { const s = [...values].sort((a, b) => a - b); return s[s.length >> 1] ?? 0; };
const hex = (rgb) => "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

// ------------------------------------------------------------ measurement
/** Ink box of an SVG text rendering (librsvg, real system fonts). */
async function inkBox(svgText, width = 2400, height = 400) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${svgText}</svg>`;
  const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = Infinity, x1 = -1, y0 = Infinity, y1 = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] > 96) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return { x0, x1, y0, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
const textSvg = (text, { size, family, weight = 400, x = 20, y = 300 }) =>
  `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" xml:space="preserve">${escapeXml(text)}</text>`;

/** Advance width of `text` (spaces included): |text| minus ||. */
const advanceCache = new Map();
async function advance(text, size, family, weight = 400) {
  const key = `${text}|${size}|${family}|${weight}`;
  if (advanceCache.has(key)) return advanceCache.get(key);
  const both = await inkBox(textSvg(`|${text}|`, { size, family, weight }));
  const bars = await inkBox(textSvg("||", { size, family, weight }));
  const value = both.w - bars.w;
  advanceCache.set(key, value);
  return value;
}

// ------------------------------------------------------------ template analysis
/** Index of the brightest averaged sample in [from, to] (a border's light line). */
function peak(profile, from, to) {
  let best = from;
  for (let k = from; k <= to; k++) if (profile(k) > profile(best)) best = k;
  return best;
}
function colAvg(raw, x, y0, y1) { let s = 0; for (let y = y0; y <= y1; y++) s += raw.lum(x, y); return s / (y1 - y0 + 1); }
function rowAvg(raw, y, x0, x1) { let s = 0; for (let x = x0; x <= x1; x++) s += raw.lum(x, y); return s / (x1 - x0 + 1); }

/** Art window = inside the light border lines (found on averaged profiles). */
function artWindow(raw) {
  const left = peak((x) => colAvg(raw, x, 300, 650), 160, 185);
  const right = peak((x) => colAvg(raw, x, 300, 650), 672, 692);
  const top = peak((y) => rowAvg(raw, y, 300, 600), 148, 168);
  const bottom = peak((y) => rowAvg(raw, y, 300, 600), 745, 762);
  // The light line is 2 px wide with a 1 px blend on the art side.
  return { left: left + 2, top: top + 2, right: right - 2, bottom: bottom - 2 };
}

/** Panel interior: inside the panel's inner bevel (local light line). */
function panelInterior(raw) {
  // Left/right: the faint bevel just inside the big gold frame line.
  const frameL = peak((x) => colAvg(raw, x, 900, 950), 50, 75);
  const bevelL = peak((x) => colAvg(raw, x, 900, 950), frameL + 3, frameL + 12);
  const frameR = peak((x) => colAvg(raw, x, 900, 950), 674, 692);
  const bevelR = peak((x) => colAvg(raw, x, 900, 950), frameR - 12, frameR - 3);
  const frameT = peak((y) => rowAvg(raw, y, 250, 300), 815, 830);
  const bevelT = peak((y) => rowAvg(raw, y, 250, 300), frameT + 4, frameT + 12);
  const frameB = peak((y) => rowAvg(raw, y, 250, 300), 955, 975);
  return { left: bevelL + 3, right: bevelR - 3, top: bevelT + 3, bottom: frameB - 3 };
}

/** Bounding boxes of ink in a region (pixels passing `test`), split by blank rows. */
function inkRows(raw, x0, x1, y0, y1, test, minRows = 8) {
  const out = []; let cur = null;
  for (let y = y0; y <= y1; y++) {
    let n = 0, a = Infinity, b = -1;
    for (let x = x0; x <= x1; x++) if (test(raw.get(x, y))) { n++; a = Math.min(a, x); b = Math.max(b, x); }
    if (n >= 2) { if (!cur) cur = { y0: y, y1: y, x0: a, x1: b }; cur.y1 = y; cur.x0 = Math.min(cur.x0, a); cur.x1 = Math.max(cur.x1, b); }
    else if (cur) { if (cur.y1 - cur.y0 + 1 >= minRows) out.push(cur); cur = null; }
  }
  if (cur && cur.y1 - cur.y0 + 1 >= minRows) out.push(cur);
  return out;
}
const isWhiteInk = ([r, g, b]) => r > 175 && g > 175 && b > 160 && Math.max(r, g, b) - Math.min(r, g, b) < 45;
const isCreamInk = ([r, g, b]) => r > 150 && g > 140 && (r + g) / 2 - b > 25;
const isFooterInk = ([r, g, b]) => r > 110 && g > 110 && b > 110;

// ------------------------------------------------------------ erasing
/** Fill a box column-wise by ping-pong tiling of a clean column band in the same rows. */
function pingPongFill(raw, box, band) {
  const w = band.x1 - band.x0 + 1;
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      const k = Math.abs(x - box.x0) % (2 * w);
      const sx = band.side === "left" ? (k < w ? band.x1 - k : band.x0 + (k - w)) : (k < w ? band.x0 + k : band.x1 - (k - w));
      raw.set(x, y, raw.get(sx, y));
    }
  }
}
/** Mirror fill a small box from its left and right neighbours (rail numerals). */
function mirrorFill(raw, box) {
  const mid = (box.x0 + box.x1) / 2;
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      const sx = x <= mid ? box.x0 - 1 - (x - box.x0) : box.x1 + 1 + (box.x1 - x);
      raw.set(x, y, raw.get(sx, y));
    }
  }
}

// ------------------------------------------------------------ overlays
async function glyphImage(name, color, size, x, y) {
  const source = (await readFile(path.join(GLYPHS, `${name}.svg`), "utf8")).replaceAll("currentColor", color);
  const href = `data:image/svg+xml;base64,${Buffer.from(source).toString("base64")}`;
  return `<image href="${href}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>`;
}

/** An overlay layer with a soft print-like drop shadow under it. */
async function overlayWithShadow(width, height, body, { dx = 1.6, dy = 1.6, blur = 1.1, opacity = 0.75, soften = 0.35 } = {}) {
  const layer = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`)).png().toBuffer();
  const shadow = await sharp(layer)
    .ensureAlpha()
    .extractChannel(3)
    .blur(blur)
    .linear(opacity, 0)
    .toBuffer();
  const shadowRgba = await sharp({ create: { width, height, channels: 3, background: "#120b05" } })
    .joinChannel(shadow)
    .png()
    .toBuffer();
  const softened = soften > 0 ? await sharp(layer).blur(0.3 + soften).png().toBuffer() : layer;
  return [
    { input: shadowRgba, left: Math.round(dx), top: Math.round(dy) },
    { input: softened, left: 0, top: 0 }
  ];
}

// ------------------------------------------------------------ build
async function buildCard(card) {
  const templateFile = path.join(ASSETS, card.template);
  const printed = TEMPLATE_VALUES[card.template];
  const raw = await Raw.load(templateFile);
  const W = raw.width, H = raw.height;
  const composites = [];

  // ---- 1. title: measure printed title, erase, re-set
  const titleInk = inkRows(raw, 150, 600, 70, 145, isCreamInk, 10);
  const title = titleInk.reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1) }));
  const titleRef = await inkBox(textSvg(printed.title, { size: 100, family: TITLE_FONT, weight: 700 }));
  const titleSize = 100 * (title.x1 - title.x0 + 1) / titleRef.w;
  const capRef = await inkBox(textSvg("H", { size: titleSize, family: TITLE_FONT, weight: 700 }));
  const titleCapTop = title.y0;
  const titleBaseline = titleCapTop + capRef.h;
  const titleColor = medianColor(raw, title, isCreamInk);
  pingPongFill(raw, { x0: title.x0 - 4, x1: title.x1 + 4, y0: title.y0 - 4, y1: title.y1 + 4 },
    { side: "left", x0: title.x0 - 4 - 70, x1: title.x0 - 5 });
  const newTitle = await inkBox(textSvg(card.name, { size: titleSize, family: TITLE_FONT, weight: 700 }));
  const titleCentre = (title.x0 + title.x1) / 2;
  // Long names keep the printed size unless they would reach the tier star.
  const titleMaxW = 2 * Math.min(titleCentre - 70, 598 - titleCentre);
  const finalTitleSize = newTitle.w > titleMaxW ? titleSize * titleMaxW / newTitle.w : titleSize;
  const titleBody = `<text x="${titleCentre}" y="${titleBaseline}" text-anchor="middle" font-family="${TITLE_FONT}" font-size="${finalTitleSize.toFixed(2)}" font-weight="700" fill="${hex(titleColor)}">${escapeXml(card.name)}</text>`;

  // ---- 2. stat numerals (rail) + cost
  const railDigits = inkRows(raw, 96, 140, 240, 830, isWhiteInk, 14)
    // the shield's white quarters sit between y 340..420 — numerals are below each icon
    .filter((box) => box.x1 - box.x0 < 30 && box.y1 - box.y0 <= 34);
  const railByStat = [[240, 330], [420, 500], [580, 660], [750, 830]].map(([a, b]) => {
    const core = railDigits.find((box) => box.y0 >= a && box.y1 <= b);
    return core ? growInk(raw, core, (p) => p[0] * 0.3 + p[1] * 0.59 + p[2] * 0.11 > 125) : undefined;
  });
  const digitRef = await inkBox(textSvg("3", { size: 100, family: TITLE_FONT, weight: 700 }));
  let railBody = "";
  for (let i = 0; i < 4; i++) {
    const box = railByStat[i];
    if (!box) throw new Error(`${card.slug}: rail numeral ${i} not found`);
    if (printed.stats[i] === card.stats[i]) continue;
    const size = 100 * (box.y1 - box.y0 + 1) / digitRef.h;
    const color = medianColor(raw, box, isWhiteInk);
    mirrorFill(raw, { x0: box.x0 - 3, x1: box.x1 + 3, y0: box.y0 - 3, y1: box.y1 + 3 });
    railBody += `<text x="${(box.x0 + box.x1) / 2 + 0.5}" y="${box.y1 + 1}" text-anchor="middle" font-family="${TITLE_FONT}" font-size="${size.toFixed(2)}" font-weight="700" fill="${hex(color)}">${card.stats[i]}</text>`;
  }
  let costBody = "";
  if (printed.cost !== card.cost) {
    const costInk = inkRows(raw, 470, 600, 765, 815, isCreamInk, 12);
    const box = costInk.reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1) }));
    const size = 100 * (box.y1 - box.y0 + 1) / digitRef.h;
    const color = medianColor(raw, box, isCreamInk);
    pingPongFill(raw, { x0: box.x0 - 4, x1: box.x1 + 4, y0: box.y0 - 4, y1: box.y1 + 4 },
      { side: "right", x0: box.x1 + 6, x1: box.x1 + 50 });
    costBody = `<text x="${box.x0}" y="${box.y1 + 1}" font-family="${TITLE_FONT}" font-size="${size.toFixed(2)}" font-weight="700" fill="${hex(color)}">${card.cost}</text>`;
  }

  // ---- 3. rules panel: measure printed rules line, then transplant an empty panel
  const panel = panelInterior(raw);
  const rulesInk = inkRows(raw, panel.left + 2, panel.right - 2, panel.top + 2, panel.bottom - 2, isWhiteInk, 8);
  const rulesLine = rulesInk[rulesInk.length - 1];
  const rulesText = printed.rules;
  const rulesRef = await inkBox(textSvg(rulesText, { size: 100, family: TITLE_FONT }));
  const rulesSize = 100 * (rulesLine.x1 - rulesLine.x0 + 1) / rulesRef.w;
  const rulesColor = medianColor(raw, { x0: panel.left, x1: panel.right, y0: panel.top, y1: panel.bottom }, isWhiteInk);
  const lineGap = rulesInk.length > 1 ? rulesInk[1].y1 - rulesInk[0].y1 : rulesSize * 1.25;

  const source = await Raw.load(path.join(ASSETS, card.panelSource));
  const sourcePanel = panelInterior(source);
  // Colour-match on clean rows: the template's rows above its first text line.
  const cleanRows = { y0: panel.top + 1, y1: Math.min(rulesInk[0].y0 - 3, panel.top + 12) };
  const stats = (img, x0, x1, y0, y1) => [0, 1, 2].map((c) => {
    let s = 0, s2 = 0, n = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const v = img.get(x, y)[c]; s += v; s2 += v * v; n++; }
    const mean = s / n; return { mean, sd: Math.sqrt(Math.max(1, s2 / n - mean * mean)) };
  });
  const { dx, dy } = registerPanel(raw, source, panel);
  void sourcePanel;
  const target = stats(raw, panel.left + 30, panel.right - 30, cleanRows.y0, cleanRows.y1);
  const from = stats(source, panel.left + 30 + dx, panel.right - 30 + dx, cleanRows.y0 + dy, cleanRows.y1 + dy);
  for (let y = panel.top; y <= panel.bottom; y++) {
    for (let x = panel.left; x <= panel.right; x++) {
      const p = source.get(x + dx, y + dy);
      raw.set(x, y, p.map((v, c) => Math.max(0, Math.min(255, (v - from[c].mean) * (target[c].sd / from[c].sd) + target[c].mean))));
    }
  }

  // Re-set the rules text: measured advances, glyphs inline, centred per line.
  const glyphSize = Math.round(rulesSize * 1.05);
  const panelCentre = (panel.left + panel.right) / 2;
  const blockH = (card.lines.length - 1) * lineGap;
  const firstBaseline = (panel.top + panel.bottom) / 2 + blockH * -0.5 + rulesSize * 0.33;
  let rulesBody = "";
  for (let li = 0; li < card.lines.length; li++) {
    const line = card.lines[li];
    const widths = [];
    for (const token of line) widths.push(typeof token === "string" ? await advance(token, rulesSize, TITLE_FONT) : glyphSize);
    let x = panelCentre - widths.reduce((a, b) => a + b, 0) / 2;
    const baseline = firstBaseline + li * lineGap;
    for (let ti = 0; ti < line.length; ti++) {
      const token = line[ti];
      if (typeof token === "string") {
        rulesBody += `<text x="${x.toFixed(2)}" y="${baseline.toFixed(2)}" font-family="${TITLE_FONT}" font-size="${rulesSize.toFixed(2)}" fill="${hex(rulesColor)}" xml:space="preserve">${escapeXml(token)}</text>`;
      } else {
        // Icons sit on the text's x-height band like the print (centred ~0.33em above the baseline).
        rulesBody += await glyphImage(token.glyph, ICON_COLOR, glyphSize, x, baseline - rulesSize * 0.33 - glyphSize / 2);
      }
      x += widths[ti];
    }
  }

  // ---- 4. footer: collector number + © years
  const footerY0 = 992, footerY1 = 1022;
  const footerWords = footerSegments(raw, 30, 715, footerY0, footerY1);
  const numberWord = footerWords[2];
  // STRETCH GOALS nnn/nnn © yyyy Archon © yyyy Ubisoft Entertainment.
  if (footerWords.length !== 10) throw new Error(`${card.slug}: footer has ${footerWords.length} words`);
  const yearWords = [footerWords[4], footerWords[7]];
  // The replaced words keep the printed words' exact width and baseline (the
  // print's digits are tabular, so the same digit count = the same width), in
  // the colour of the whole printed footer line.
  const footerColor = medianColor(raw, { x0: footerWords[0].x0, x1: footerWords[9].x1, y0: footerY0, y1: footerY1 }, isFooterInk);
  let footerBody = "";
  for (const [word, oldText, text] of [[numberWord, printed.footerNumber, card.footer.number], ...yearWords.map((word) => [word, "2024", card.footer.year])]) {
    const ref = await inkBox(textSvg(oldText, { size: 100, family: FOOTER_FONT, weight: 600, x: 20 }));
    const size = 100 * (word.x1 - word.x0 + 1) / ref.w;
    const placed = await inkBox(textSvg(text, { size, family: FOOTER_FONT, weight: 600, x: 20, y: 300 }));
    blackFill(raw, { x0: word.x0 - 1, x1: word.x1 + 1, y0: word.y0 - 2, y1: word.y1 + 2 });
    footerBody += `<text x="${(word.x0 - (placed.x0 - 20)).toFixed(2)}" y="${(word.y1 - (placed.y1 - 300)).toFixed(2)}" font-family="${FOOTER_FONT}" font-size="${size.toFixed(2)}" font-weight="600" fill="${hex(footerColor)}">${text}</text>`;
  }

  // ---- 5. art + type glyph
  const win = artWindow(raw);
  const glyphBox = { x0: win.left + 8, x1: win.left + 75, y0: win.top + 6, y1: win.top + 72 };
  const glyphLayer = await typeGlyph(raw, glyphBox);
  const art = await sharp(path.join(ART, `${card.slug}.png`))
    .resize(win.right - win.left + 1, win.bottom - win.top + 1, { fit: "cover", position: "centre" })
    .removeAlpha()
    .toBuffer();
  composites.push({ input: art, left: win.left, top: win.top });
  composites.push(...glyphLayer);

  // ---- 6. lettering overlays (print-like soft shadow)
  composites.push(...await overlayWithShadow(W, H, titleBody, { dx: 2, dy: 2, blur: 1.2, opacity: 0.8 }));
  if (railBody || costBody) composites.push(...await overlayWithShadow(W, H, railBody + costBody, { dx: 2, dy: 2, blur: 1.2, opacity: 0.8 }));
  composites.push(...await overlayWithShadow(W, H, rulesBody, { dx: 1, dy: 1, blur: 1, opacity: 0.7, soften: 0.2 }));
  composites.push(...await overlayWithShadow(W, H, footerBody, { dx: 0, dy: 0, blur: 0.3, opacity: 0, soften: 0.15 }));

  const destination = path.join(ASSETS, `units-neutral-${card.tier}-${card.slug}.webp`);
  const output = await raw.sharp().composite(composites).webp({ quality: 88, effort: 6 }).toBuffer();
  await writeFile(destination, output);
  return destination;
}

const ICON_COLOR = "#e6d48e";

function medianColor(raw, box, test) {
  const r = [], g = [], b = [];
  for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) {
    const p = raw.get(x, y);
    if (test(p)) { r.push(p[0]); g.push(p[1]); b.push(p[2]); }
  }
  return [median(r), median(g), median(b)];
}

/** Words of the footer line (ink columns split on gaps of >= 5 px). */
function footerSegments(raw, x0, x1, y0, y1) {
  const cols = [];
  for (let x = x0; x <= x1; x++) {
    let a = Infinity, b = -1;
    for (let y = y0; y <= y1; y++) if (isFooterInk(raw.get(x, y))) { a = Math.min(a, y); b = Math.max(b, y); }
    cols.push(b >= 0 ? { x, y0: a, y1: b } : null);
  }
  const words = []; let cur = null, gap = 0;
  for (const col of cols) {
    if (col) { if (!cur) cur = { x0: col.x, x1: col.x, y0: col.y0, y1: col.y1 }; cur.x1 = col.x; cur.y0 = Math.min(cur.y0, col.y0); cur.y1 = Math.max(cur.y1, col.y1); gap = 0; }
    else if (cur && ++gap >= 4) { words.push(cur); cur = null; gap = 0; }
  }
  if (cur) words.push(cur);
  return words.filter((word) => word.x1 - word.x0 >= 3);
}

/** Footer background is near-black: fill with the local dark median. */
function blackFill(raw, box) {
  const around = [];
  for (let x = box.x0; x <= box.x1; x++) { around.push(raw.get(x, box.y0 - 2)); around.push(raw.get(x, box.y1 + 2)); }
  const base = [0, 1, 2].map((c) => median(around.map((p) => p[c])));
  for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) {
    const above = raw.get(x, box.y0 - 2 - ((y - box.y0) % 3));
    raw.set(x, y, above.map((v, c) => (v + base[c]) / 2));
  }
}

/** The printed type glyph keyed out of the template (exact printed shape). */
async function keyTypeGlyph(raw, box) {
  const w = box.x1 - box.x0 + 1, h = box.y1 - box.y0 + 1;
  const alpha = Buffer.alloc(w * h);
  const strong = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = raw.get(box.x0 + x, box.y0 + y);
    const yellow = (r + g) / 2 - b;
    const lum = r * 0.3 + g * 0.59 + b * 0.11;
    const a = Math.max(0, Math.min(1, (yellow - 22) / 38)) * Math.max(0, Math.min(1, (lum - 120) / 55));
    alpha[y * w + x] = Math.round(a * 255);
    if (a > 0.95) strong.push([r, g, b]);
  }
  const color = [0, 1, 2].map((c) => median(strong.map((p) => p[c])));
  const rgb = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) { rgb[i * 3] = color[0]; rgb[i * 3 + 1] = color[1]; rgb[i * 3 + 2] = color[2]; }
  const glyph = sharp(rgb, { raw: { width: w, height: h, channels: 3 } }).joinChannel(alpha, { raw: { width: w, height: h, channels: 1 } }).png();
  const shadowRgb = Buffer.alloc(w * h * 3, 18);
  const shadowAlpha = Buffer.from(alpha.map((v) => Math.round(v * 0.55)));
  const shadow = sharp(shadowRgb, { raw: { width: w, height: h, channels: 3 } }).joinChannel(shadowAlpha, { raw: { width: w, height: h, channels: 1 } }).blur(0.8).png();
  return [
    { input: await shadow.toBuffer(), left: box.x0 + 1, top: box.y0 + 1 },
    { input: await glyph.toBuffer(), left: box.x0, top: box.y0 }
  ];
}

// ------------------------------------------------------------ main
const previewIndex = process.argv.indexOf("--preview");
const outputs = [];
for (const card of CARDS) {
  const out = await buildCard(card);
  outputs.push(out);
  console.log(path.relative(ROOT, out));
}
if (previewIndex > 0) {
  const tiles = await Promise.all(outputs.map((file) => sharp(file).png().toBuffer()));
  await sharp({ create: { width: 743 * tiles.length + 20 * (tiles.length - 1), height: 1040, channels: 3, background: "#000" } })
    .composite(tiles.map((input, index) => ({ input, left: index * 763, top: 0 })))
    .png()
    .toFile(process.argv[previewIndex + 1]);
}

/** Grow a numeral box to every connected pixel passing `test` (its shaded strokes). */
function growInk(raw, box, test) {
  const out = { ...box };
  for (let changed = true; changed;) {
    changed = false;
    const tryEdge = (x0, x1, y0, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (test(raw.get(x, y))) return true; return false; };
    if (out.y0 > box.y0 - 14 && tryEdge(out.x0, out.x1, out.y0 - 1, out.y0 - 1)) { out.y0--; changed = true; }
    if (out.y1 < box.y1 + 14 && tryEdge(out.x0, out.x1, out.y1 + 1, out.y1 + 1)) { out.y1++; changed = true; }
    if (out.x0 > box.x0 - 8 && tryEdge(out.x0 - 1, out.x0 - 1, out.y0, out.y1)) { out.x0--; changed = true; }
    if (out.x1 < box.x1 + 8 && tryEdge(out.x1 + 1, out.x1 + 1, out.y0, out.y1)) { out.x1++; changed = true; }
  }
  return out;
}

/** Offset of the empty-panel source against the template, found on the panel's frame ring. */
function registerPanel(raw, source, panel) {
  let best = { dx: 0, dy: 0, sad: Infinity };
  const ring = [];
  for (let y = panel.top - 14; y <= panel.bottom + 10; y += 2) {
    for (let x = panel.left - 14; x <= panel.right + 14; x += 2) {
      const inside = x >= panel.left - 2 && x <= panel.right + 2 && y >= panel.top - 2 && y <= panel.bottom + 2;
      if (!inside) ring.push([x, y]);
    }
  }
  for (let dy = -14; dy <= 14; dy++) for (let dx = -14; dx <= 14; dx++) {
    let sad = 0;
    for (const [x, y] of ring) sad += Math.abs(raw.lum(x, y) - source.lum(x + dx, y + dy));
    if (sad < best.sad) best = { dx, dy, sad };
  }
  return best;
}

/** The card-glyph type mark drawn where the printed one sits, in its printed colour. */
async function typeGlyph(raw, box) {
  const strong = [];
  let x0 = Infinity, x1 = -1, y0 = Infinity, y1 = -1;
  for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) {
    const [r, g, b] = raw.get(x, y);
    if ((r + g) / 2 - b > 45 && r * 0.3 + g * 0.59 + b * 0.11 > 165) { strong.push([r, g, b]); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  if (strong.length < 40) throw new Error("type glyph not found on the template");
  const color = hex([0, 1, 2].map((c) => median(strong.map((p) => p[c]))));
  const size = Math.max(x1 - x0 + 1, y1 - y0 + 1);
  const source = (await readFile(path.join(GLYPHS, "unit_ground.svg"), "utf8")).replaceAll("currentColor", color);
  const glyph = await sharp(Buffer.from(source)).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const shadow = await sharp(glyph).ensureAlpha().extractChannel(3).linear(0.55, 0).blur(0.8).toBuffer();
  const shadowRgba = await sharp({ create: { width: size, height: size, channels: 3, background: "#120b05" } }).joinChannel(shadow).png().toBuffer();
  const left = Math.round((x0 + x1) / 2 - size / 2), top = Math.round((y0 + y1) / 2 - size / 2);
  return [{ input: shadowRgba, left: left + 1, top: top + 1 }, { input: glyph, left, top }];
}

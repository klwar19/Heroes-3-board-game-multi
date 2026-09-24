#!/usr/bin/env node
// Builds the Factory unit card faces (Few / Pack / Neutral) at 2x HD in the
// real printed format — same template kit as scripts/build-forge-unit-cards.mjs
// (copied here so the two builders can be run and edited independently).
//
//   node scripts/build-factory-unit-cards.mjs [slugFilter]
//
// Printed elements come from the REAL game components: the blank unit frames
// public/assets/units-blank-<tier>.webp (Few/Pack), the real neutral Boars scan
// (Neutral, star from a real silver/golden neutral), the frame's own cost icons,
// the red valuables crystal from the real Archangels card, the card glyph SVGs
// (scripts/card-glyphs) and Times New Roman bold digits/text. Only the creature
// art is new: Codex image_gen masters painted from the official Factory art
// (generated-session-art/factory/units/<slug>-official.png): the Factory key art
// for Grenadiers/Engineers/Armadillos/Sandworms/Juggernauts, faithful HD
// re-renders of the official card illustrations for Bounty Hunters, Automatons
// and Couatls.
// Values must match src/data/factions/units.ts (factory.* and neutral.grenadiers).
// Output: public/assets/units-factory-<tier>-<slug>-<few|pack|neutral>.webp
//         (Grenadiers Neutral: public/assets/units-neutral-bronze-grenadiers.webp)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import sharp from "sharp";

const K = 2; // output scale over the 743x1040 print template
const W = 743 * K;
const H = 1040 * K;
const k = (v) => Math.round(v * K);
const MASTERS = "generated-session-art/factory/units";
const GLYPHS = "scripts/card-glyphs";
const FONT = "Times New Roman";
const CREAM = "#f4ead0";
const TITLE = "#f3e3b0";
const GOLD = "#ecd08a";
const STROKE = "#22150a";
const WEBP = { quality: 92, effort: 6, smartSubsample: true };
const filter = process.argv[2] ?? "";


// ---- card data (must match src/data/factions/units.ts) ---------------------
// Ability tokens: "{glyph}" inserts a card glyph; plain strings are text. The
// printed Factory cards mark activations with the spiral glyph ({unit_other}).
// `sides`: faction faces to build (default Few + Pack); `neutral: null` skips
// the Neutral face. `artTop` places the art-window crop on the tall portrait
// master (0 = top .. 1 = bottom of the spare height).
const LINE_ATTACK = ["{unit_attack}", "Attack 2 spaces in a line. The first attack resolves normally, and the second has 1", "{attack}", "."];
const SPLASH = (a, b, c) => ["{unit_other}", `Instead of attacking, select up to 3 units adjacent to this one. Allocate ${a}/${b}/${c}`, "{damage}", ", starting with the first selected unit. Stop when done."];
const ROLL_TWO = "Roll 2 Attack dice and resolve the higher one.";
const units = [
  // Halflings: the Factory Grenadiers have no neutral side of their own; their
  // Neutral-deck twin is the separate neutral.grenadiers card (same art).
  { slug: "halflings", name: "Grenadiers", tier: "bronze", type: "ranged", art: "halflings-official", artTop: 0,
    few: { stats: [2, 0, 2, 4], cost: [2], upgrade: [3], text: ["{unit_attack}", ROLL_TWO] },
    pack: { stats: [2, 0, 3, 6], text: ["{unit_attack}", ROLL_TWO, "If you resolve a +1 on the Attack Die, the attacked unit suffers -1", "{defense}", "(to a minimum of 0)."] },
    neutral: { out: "units-neutral-bronze-grenadiers", stats: [2, 0, 3, 7], cost: [5], text: ["{unit_attack}", ROLL_TWO, "If you resolve a +1 on the Attack Die, the attacked unit suffers -1", "{defense}", "(to a minimum of 0)."] } },
  { slug: "mechanics", name: "Engineers", tier: "bronze", type: "ground", art: "mechanics-official", artTop: 0.02,
    few: { stats: [2, 0, 3, 6], cost: [3], upgrade: [5], text: LINE_ATTACK },
    pack: { stats: [2, 1, 4, 7], text: ["{unit_other}", "Remove up to 2", "{damage}", "from an adjacent mechanical unit, or gain +1", "{attack}", "."] },
    neutral: { stats: [2, 0, 4, 6], cost: [5], text: LINE_ATTACK } },
  { slug: "armadillos", name: "Armadillos", tier: "bronze", type: "ground", art: "armadillos-official", artTop: 0.2,
    few: { stats: [2, 1, 4, 4], cost: [4], upgrade: [6], text: [] },
    pack: { stats: [3, 1, 4, 6], text: ["{unit_passive}", "Whenever this unit's", "{initiative}", "is increased by an effect, increase it by an additional 1."] },
    neutral: { stats: [2, 1, 4, 6], cost: [5], text: [] } },
  { slug: "sandworms", name: "Sandworms", tier: "silver", type: "flying", art: "sandworms-official", artTop: 0.02,
    few: { stats: [4, 1, 5, 8], cost: [7], upgrade: [12], text: [] },
    pack: { stats: [5, 1, 6, 10], text: ["{unit_passive}", "Place a faction cube on this unit whenever it defeats an enemy unit.", "\n", "{unit_other}", "You may remove a faction cube from this unit in order to attack again."] },
    neutral: { stats: [3, 1, 4, 8], cost: [15], text: ["{unit_attack}", "If the target is an adjacent unit, attack this target again."] } },
  // Juggernauts Neutral = a GOLD-tier neutral (not azure): 5/2/7/6, 28 gold.
  { slug: "dreadnoughts", name: "Juggernauts", tier: "golden", type: "ground", art: "dreadnoughts-official", artTop: 0.28,
    few: { stats: [6, 3, 8, 6], cost: [19, 1], upgrade: [30, 2], text: SPLASH(2, 1, 1) },
    pack: { stats: [7, 3, 10, 7], text: SPLASH(3, 2, 1) },
    neutral: { stats: [5, 2, 7, 6], cost: [28], text: SPLASH(2, 1, 1) } },
  // Bounty Hunters + Automatons: faithful HD re-renders of the OFFICIAL card
  // illustrations (user photos of the printed Neutral cards, deskewed, as the
  // Codex reference). Couatls: faithful HD re-render of the official Couatl art
  // the previous Few/Pack faces carried.
  { slug: "gunslingers", name: "Bounty Hunters", tier: "golden", type: "ranged", art: "gunslingers-official", artTop: 0.32,
    few: { stats: [5, 1, 5, 7], cost: [11], upgrade: [16, 1], text: ["{unit_passive}", "At the start of Combat, place a Mark token on an enemy unit. Bounty Hunters gain +1", "{attack}", "against Marked units."] },
    pack: { stats: [5, 1, 6, 8], text: ["{unit_passive}", "At the start of Combat, place a Mark token on an enemy unit. Bounty Hunters gain +1", "{attack}", "against Marked units."] },
    // Printed on the official Factory Neutral card (4/1/5/7, 16 gold).
    neutral: { stats: [4, 1, 5, 7], cost: [16], text: ["{unit_passive}", "When attacked by a non-adjacent", "{unit_ranged}", "unit, retaliate before the incoming attack."] } },
  { slug: "automatons", name: "Automatons", tier: "silver", type: "ground", art: "automatons-official", artTop: 0.15,
    few: { stats: [3, 1, 4, 8], cost: [6], upgrade: [8], text: ["{unit_other}", "You may place a faction cube on this unit (up to 2).", "\n", "{unit_passive}", "When defeated, remove them to inflict that much", "{damage}", "to all adjacent units."] },
    pack: { stats: [4, 1, 4, 9], text: ["{unit_attack}", "Ignore Retaliation Attacks."] },
    // Printed on the official Factory Neutral card (12 gold, Detonate 2).
    neutral: { stats: [3, 1, 4, 9], cost: [12], text: ["{unit_passive}", "When this unit is removed, deal 2", "{damage}", "to each adjacent unit."] } },
  // Couatls: the first-round targeting ward (protocol v166) text carried by the
  // previous "first-round" faces, set in the official frame. Few = activation
  // (spiral) choice; Pack = passive glyph (the Pack protection is passive).
  { slug: "couatls", name: "Couatls", tier: "golden", type: "flying", art: "couatls-official", artTop: 0.05,
    few: { stats: [6, 3, 8, 11], cost: [18, 1], upgrade: [30, 2], text: ["{unit_other}", "During the first round, you may end this unit's activation. If you do, it cannot be targeted by attacks or Spells until the round ends. Retaliation Attacks still work."] },
    pack: { stats: [7, 3, 8, 16], text: ["{unit_passive}", "This unit cannot be targeted by attacks or Spells during the first round, including by Neutral units. Retaliation Attacks still work."] },
    // Gold-tier Neutral price (gold only, no valuables): 28 gold.
    neutral: { stats: [5, 2, 8, 13], cost: [28], text: [] } }
];

// ---- template geometry (1x, measured on the real scans) --------------------
const FEW = {
  art: { left: 173, top: 157, width: 509, height: 597 },
  typeGlyph: { left: 186, top: 170, height: 40 },
  title: { cx: 372, top: 58, size: 46, cover: null },
  stats: { cx: 117, cy: [270, 422, 573, 725], size: 42 },
  cells: [
    { left: 70, top: 764, width: 298, height: 56 },
    { left: 377, top: 764, width: 298, height: 56 }
  ],
  bar: { left: 68, top: 763, width: 609, height: 58 },
  panel: { left: 80, top: 834, width: 584, height: 124 }
};
const NEUTRAL = {
  art: { left: 170, top: 171, width: 502, height: 592 },
  typeGlyph: { left: 183, top: 183, height: 40 },
  title: { cx: 372, top: 72, size: 46, strip: { left: 540, top: 78, width: 40, height: 76 }, region: { left: 150, top: 78, width: 440, height: 76 } },
  stats: { cx: 110, cy: [283, 456, 623, 790], size: 42, strip: { left: 134, width: 22 } },
  cells: [{ left: 172, top: 766, width: 502, height: 52 }],
  panel: { left: 80, top: 846, width: 584, height: 130 }
};
const NEUTRAL_TEMPLATE = "public/assets/units-neutral-bronze-boars.webp";
const NEUTRAL_STAR = { silver: "public/assets/units-neutral-silver-basilisks.webp", golden: "public/assets/units-neutral-golden-behemoths.webp", azure: "public/assets/units-neutral-azure-hydras.webp" };
const STAR_BOX = { left: 600, top: 84, width: 62, height: 62 };

// ---- helpers ----------------------------------------------------------------
const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const textSvg = (text, size, fill, width, height = size * 2) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(width)}" height="${Math.ceil(height)}">` +
  `<defs><filter id="s" x="-10%" y="-10%" width="120%" height="140%"><feDropShadow dx="0" dy="${size / 28}" stdDeviation="${size / 30}" flood-color="#000" flood-opacity=".75"/></filter></defs>` +
  `<text x="${size * 0.1}" y="${Math.round(size * 1.25)}" font-family="${FONT}" font-weight="bold" font-size="${size}" fill="${fill}" ` +
  `stroke="${STROKE}" stroke-width="${Math.max(1, size / 24)}" paint-order="stroke" filter="url(#s)" xml:space="preserve">${esc(text)}</text></svg>`);
const widths = new Map();
async function measure(text, size) {
  const key = `${size}|${text}`;
  if (!widths.has(key)) {
    const { info } = await sharp(textSvg(text, size, CREAM, size * text.length + 40)).trim().toBuffer({ resolveWithObject: true });
    widths.set(key, info.width);
  }
  return widths.get(key);
}
async function centred(text, size, fill, cx, top) {
  const w = await measure(text, size);
  return { input: textSvg(text, size, fill, w + size), left: Math.round(cx - w / 2 - size * 0.1), top };
}
let initiativeIcon;
let healthIcon;
async function glyph(name, height, color) {
  if (name === "health") {
    const buf = await sharp(healthIcon).resize({ height }).png().toBuffer();
    const m = await sharp(buf).metadata();
    return { buf, width: m.width, height: m.height };
  }
  if (name === "initiative") {
    const buf = await sharp(initiativeIcon).resize({ height }).png().toBuffer();
    const m = await sharp(buf).metadata();
    return { buf, width: m.width, height: m.height };
  }
  let svg = readFileSync(`${GLYPHS}/${name}.svg`, "utf8").replace(/<svg\b/, `<svg color="${color}" fill="${color}"`);
  const buf = await sharp(Buffer.from(svg), { density: 600 }).resize({ height }).png().toBuffer();
  const m = await sharp(buf).metadata();
  return { buf, width: m.width, height: m.height };
}
const GLYPH_COLOR = { defense: "#9cc3ee", damage: GOLD, attack: GOLD, spell: GOLD, unit_attack: GOLD, unit_passive: GOLD };

async function layoutText(tokens, box, size) {
  const words = [];
  for (const t of tokens) {
    if (/^\{[a-z_]+\}$/.test(t)) words.push({ glyph: t.slice(1, -1) });
    else if (t === "\n") words.push({ br: true });
    else for (const w of t.split(/\s+/).filter(Boolean)) words.push({ text: w });
  }
  const space = (await measure("n n", size)) - (await measure("nn", size));
  const gh = Math.round(size * 1.15);
  const items = [];
  for (const w of words) {
    if (w.br) items.push({ br: true });
    else if (w.glyph) { const g = await glyph(w.glyph, gh, GLYPH_COLOR[w.glyph] ?? GOLD); items.push({ ...w, width: g.width + Math.round(size * 0.06), buf: g.buf, gh: g.height }); }
    else items.push({ ...w, width: await measure(w.text, size) });
  }
  const lines = [];
  let line = [], lw = 0;
  for (const it of items) {
    if (it.br) { lines.push({ items: line, width: lw }); line = []; lw = 0; continue; }
    it.tight = Boolean(it.text && /^[.,;:!?]+/.test(it.text));
    const add = (line.length && !it.tight ? space : 0) + it.width;
    if (line.length && !it.tight && lw + add > box.width) { lines.push({ items: line, width: lw }); line = []; lw = 0; }
    lw += (line.length && !it.tight ? space : 0) + it.width;
    line.push(it);
  }
  if (line.length) lines.push({ items: line, width: lw });
  const lineH = Math.round(size * 1.2);
  return { lines, lineH, space, size };
}
async function fitText(tokens, box) {
  for (let size = k(28); size >= k(18); size -= 1) {
    const l = await layoutText(tokens, box, size);
    if (l.lines.length * l.lineH <= box.height && l.lines.every((x) => x.width <= box.width)) return l;
  }
  return layoutText(tokens, box, k(18));
}
function placeText(l, box) {
  const ops = [];
  let y = box.top + Math.round((box.height - l.lines.length * l.lineH) / 2) - Math.round(l.size * 0.12);
  for (const line of l.lines) {
    let x = box.left + Math.round((box.width - line.width) / 2);
    for (const it of line.items) {
      if (it.tight) x -= l.space;
      if (it.glyph) ops.push({ input: it.buf, left: x + 2, top: y + Math.round(l.size * 1.27) - it.gh + Math.round(l.size * 0.12) });
      else ops.push({ input: textSvg(it.text, l.size, CREAM, it.width + l.size), left: x - Math.round(l.size * 0.1), top: y });
      x += it.width + l.space;
    }
    y += l.lineH;
  }
  return ops;
}
/** Seamless mirrored tile of a clean strip of `img` (a Kx buffer) over a Kx region. */
async function tilePatch(img, strip, region) {
  const base = await sharp(img).extract(strip).png().toBuffer();
  const flop = await sharp(base).flop().png().toBuffer();
  const flip = await sharp(base).flip().png().toBuffer();
  const both = await sharp(base).flip().flop().png().toBuffer();
  const patch = await sharp({ create: { width: strip.width * 2, height: strip.height * 2, channels: 4, background: "#000" } })
    .composite([{ input: base, left: 0, top: 0 }, { input: flop, left: strip.width, top: 0 }, { input: flip, left: 0, top: strip.height }, { input: both, left: strip.width, top: strip.height }])
    .png().toBuffer();
  const tile = await sharp(patch).extract({ left: 0, top: 0, width: Math.min(strip.width * 2, region.width), height: Math.min(strip.height * 2, region.height) }).png().toBuffer();
  const input = await sharp({ create: { width: region.width, height: region.height, channels: 4, background: "#000" } }).composite([{ input: tile, tile: true, gravity: "northwest" }]).png().toBuffer();
  return { input, left: region.left, top: region.top };
}
const kr = (r) => ({ left: k(r.left), top: k(r.top), width: k(r.width), height: k(r.height) });
/** Bright-gold icon clusters inside a Kx region → [{left,width}] by x gaps. */
async function iconClusters(img, region) {
  const { data, info } = await sharp(img).extract(region).raw().toBuffer({ resolveWithObject: true });
  const cols = new Array(info.width).fill(0);
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * info.channels;
    if (data[i] > 170 && data[i + 1] > 135 && data[i + 2] < 150) cols[x]++;
  }
  const out = [];
  let st = -1, gap = 0;
  for (let x = 0; x <= info.width; x++) {
    const on = x < info.width && cols[x] > 1;
    if (on) { if (st < 0) st = x; gap = 0; } else if (st >= 0 && ++gap > k(6)) { out.push({ left: region.left + st, width: x - gap - st + 1 }); st = -1; gap = 0; }
  }
  return out;
}

// ---- shared parts -------------------------------------------------------------
async function upscale(file) {
  return sharp(readFileSync(file)).resize(743, 1040, { fit: "fill" }).resize(W, H, { kernel: "lanczos3" }).png().toBuffer();
}
const typeGlyphName = { ground: "unit_ground", ranged: "unit_ranged", flying: "unit_flying" };
async function artOp(u, geo, artName = u.art ?? u.slug) {
  const file = `${u.masters ?? MASTERS}/${artName}.png`;
  const width = k(geo.art.width), height = k(geo.art.height);
  let input;
  if (u.artTop !== undefined) {
    // Aspect crop placed at artTop of the spare height (keeps a raised weapon
    // or the feet of a tall portrait master in frame).
    const meta = await sharp(readFileSync(file)).metadata();
    let cw = meta.width, ch = Math.round(meta.width * height / width);
    if (ch > meta.height) { ch = meta.height; cw = Math.round(meta.height * width / height); }
    input = await sharp(readFileSync(file))
      .extract({ left: Math.round((meta.width - cw) / 2), top: Math.round((meta.height - ch) * u.artTop), width: cw, height: ch })
      .resize(width, height, { fit: "fill" }).png().toBuffer();
  } else {
    input = await sharp(readFileSync(file)).resize(width, height, { fit: "cover", position: u.focus }).png().toBuffer();
  }
  return { input, left: k(geo.art.left), top: k(geo.art.top) };
}
async function typeGlyphOp(u, geo) {
  const g = await glyph(typeGlyphName[u.type], k(geo.typeGlyph.height), "#efd98e");
  const shadow = await sharp(g.buf).ensureAlpha().linear(0, 0).blur(k(1.5)).png().toBuffer();
  return [{ input: shadow, left: k(geo.typeGlyph.left) + k(1), top: k(geo.typeGlyph.top) + k(1.5), blend: "multiply" }, { input: g.buf, left: k(geo.typeGlyph.left), top: k(geo.typeGlyph.top) }];
}
async function statOps(stats, geo) {
  const ops = [];
  for (let i = 0; i < 4; i++) ops.push(await centred(String(stats[i]), k(geo.stats.size), CREAM, k(geo.stats.cx), k(geo.stats.cy[i]) - Math.round(k(geo.stats.size) * 0.92)));
  return ops;
}
/** Re-lay one cost cell: [lead icon] [coin] N [crystal M], centred, with the frame's own icons. */
async function costCellOps(img, cell, lead, coin, crystal, amounts) {
  const r = kr(cell);
  const ops = [await tilePatch(img, { left: r.left + r.width - k(46), top: r.top + k(4), width: k(34), height: r.height - k(8) }, { ...r, left: r.left + k(3), width: r.width - k(6) })];
  const size = k(38);
  const parts = [{ buf: lead.buf, w: lead.w, h: lead.h }, { gap: k(12) }, { buf: coin.buf, w: coin.w, h: coin.h }, { gap: k(9) }, { text: String(amounts[0]) }];
  if (amounts[1]) parts.push({ gap: k(14) }, { buf: crystal.buf, w: crystal.w, h: crystal.h }, { gap: k(7) }, { text: String(amounts[1]) });
  let total = 0;
  for (const p of parts) total += p.gap ?? p.w ?? (p.w = await measure(p.text, size));
  let x = r.left + Math.round((r.width - total) / 2);
  const mid = r.top + Math.round(r.height / 2);
  for (const p of parts) {
    if (p.gap) { x += p.gap; continue; }
    if (p.buf) ops.push({ input: p.buf, left: x, top: mid - Math.round(p.h / 2) });
    else ops.push({ input: textSvg(p.text, size, CREAM, p.w + size), left: x - Math.round(size * 0.1), top: mid - Math.round(size * 0.94) });
    x += p.w;
  }
  return ops;
}
async function iconCrop(img, left, width, cell) {
  const r = kr(cell);
  const buf = await sharp(img).extract({ left: left - k(2), top: r.top + k(3), width: width + k(4), height: r.height - k(6) }).png().toBuffer();
  const m = await sharp(buf).metadata();
  return { buf, w: m.width, h: m.height };
}
async function crystalIcon() {
  // the red valuables crystal from the real Archangels Few cost bar (1x 283..325 x 780..815)
  const src = await sharp(readFileSync("public/assets/units-castle-golden-archangels-few.webp")).resize(W, H, { kernel: "lanczos3" }).extract({ left: k(283), top: k(779), width: k(42), height: k(38) }).raw().toBuffer({ resolveWithObject: true });
  const { data, info } = src;
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0, j = 0; i < data.length; i += info.channels, j += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const red = r - Math.max(g, b);
    const a = Math.max(0, Math.min(255, (red - 28) * 9));
    out[j] = r; out[j + 1] = g; out[j + 2] = b; out[j + 3] = Math.max(a, 0);
  }
  const buf = await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).blur(0.4).png().toBuffer();
  return { buf, w: info.width, h: info.height };
}
/** Keep only the bright gold/white icon pixels of a crop (alpha from luminance), trimmed. */
async function cutOut(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2];
    const red = data[i] - Math.max(data[i + 1], data[i + 2]);
    data[i + 3] = Math.max(0, Math.min(255, Math.max((lum - 105) * 4, (red - 70) * 4)));
  }
  return sharp(data, { raw: info }).trim({ threshold: 1 }).png().toBuffer();
}
function hashSvg(size, fill) {
  // chunky gold "#" like the printed Pack banner
  const s = size, t = s * 0.2;
  return `<g transform="skewX(-8)"><rect x="${s * 0.22}" y="0" width="${t}" height="${s}" rx="${t * 0.2}" fill="${fill}"/><rect x="${s * 0.58}" y="0" width="${t}" height="${s}" rx="${t * 0.2}" fill="${fill}"/>` +
    `<rect x="0" y="${s * 0.24}" width="${s}" height="${t}" rx="${t * 0.2}" fill="${fill}"/><rect x="0" y="${s * 0.58}" width="${s}" height="${t}" rx="${t * 0.2}" fill="${fill}"/></g>`;
}
async function packBandOps(img) {
  const bar = kr(FEW.bar);
  const ops = [await tilePatch(img, { left: k(300), top: k(768), width: k(40), height: k(48) }, { left: bar.left + k(2), top: bar.top + k(2), width: bar.width - k(4), height: bar.height - k(4) })];
  const size = k(40);
  const word = await measure("PACK", size);
  const hs = Math.round(size * 0.78);
  const total = hs + k(12) + word;
  const x0 = Math.round(W / 2 - total / 2);
  const cy = bar.top + Math.round(bar.height / 2);
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${hs + 8}" height="${hs + 8}"><defs><filter id="s"><feDropShadow dx="0" dy="${k(1)}" stdDeviation="${k(1)}" flood-color="#000" flood-opacity=".8"/></filter></defs><g filter="url(#s)" transform="translate(4 2)">${hashSvg(hs, GOLD)}</g></svg>`);
  ops.push({ input: svg, left: x0, top: cy - Math.round(hs / 2) - 2 });
  ops.push({ input: textSvg("PACK", size, GOLD, word + size), left: x0 + hs + k(12) - Math.round(size * 0.1), top: cy - Math.round(size * 0.94) });
  return ops;
}

// ---- builders ---------------------------------------------------------------
async function buildFewPack(u, side, frameImg, parts) {
  const face = u[side];
  const ops = [await artOp(u, FEW), ...(await typeGlyphOp(u, FEW))];
  ops.push(await centred(u.name, k(u.name.length > 12 ? 40 : 46), TITLE, k(FEW.title.cx), k(FEW.title.top)));
  ops.push(...(await statOps(face.stats, FEW)));
  if (side === "few") {
    ops.push(...(await costCellOps(frameImg, FEW.cells[0], parts.hand, parts.coinL, parts.crystal, face.cost)));
    ops.push(...(await costCellOps(frameImg, FEW.cells[1], parts.arrows, parts.coinR, parts.crystal, face.upgrade)));
  } else {
    ops.push(...(await packBandOps(frameImg)));
  }
  if (face.text.length) ops.push(...placeText(await fitText(face.text, kr(FEW.panel)), kr(FEW.panel)));
  return sharp(frameImg).composite(ops).webp(WEBP).toBuffer();
}

async function buildNeutral(u, tpl, parts) {
  const face = u.neutral;
  const tier = face.tier ?? u.tier;
  const ops = [await artOp(u, NEUTRAL, face.art), ...(await typeGlyphOp(u, NEUTRAL))];
  ops.push(await tilePatch(tpl, kr(NEUTRAL.title.strip), kr(NEUTRAL.title.region)));
  if (tier !== "bronze") {
    const star = await sharp(readFileSync(NEUTRAL_STAR[tier])).resize(W, H, { kernel: "lanczos3" }).extract(kr(STAR_BOX)).png().toBuffer();
    ops.push({ input: star, left: k(STAR_BOX.left), top: k(STAR_BOX.top) });
  }
  ops.push(await centred(u.name, k(u.name.length > 12 ? 40 : 46), TITLE, k(NEUTRAL.title.cx), k(NEUTRAL.title.top)));
  for (const cy of NEUTRAL.stats.cy) {
    ops.push(await tilePatch(tpl, { left: k(NEUTRAL.stats.strip.left), top: k(cy - 24), width: k(NEUTRAL.stats.strip.width), height: k(50) }, { left: k(86), top: k(cy - 24), width: k(48), height: k(50) }));
  }
  ops.push(...(await statOps(face.stats, NEUTRAL)));
  ops.push(...(await costCellOps(tpl, NEUTRAL.cells[0], parts.nHand, parts.nCoin, parts.crystal, face.cost)));
  if (face.text.length) ops.push(...placeText(await fitText(face.text, kr(NEUTRAL.panel)), kr(NEUTRAL.panel)));
  return sharp(tpl).composite(ops).webp(WEBP).toBuffer();
}


// ---- main -------------------------------------------------------------------
const selected = units.filter((u) => !filter || u.slug.includes(filter));
for (const u of selected) if (!existsSync(`${MASTERS}/${u.art}.png`)) throw new Error(`missing art master ${MASTERS}/${u.art}.png`);
mkdirSync("public/assets", { recursive: true });
const crystal = await crystalIcon();
const frames = {};
const parts = { crystal };
for (const tier of ["bronze", "silver", "golden"]) {
  const img = await upscale(`public/assets/units-blank-${tier}.webp`);
  const left = await iconClusters(img, kr(FEW.cells[0]));
  const right = await iconClusters(img, kr(FEW.cells[1]));
  if (left.length !== 2 || right.length !== 2) throw new Error(`cost icons not found on ${tier}: ${JSON.stringify({ left, right })}`);
  frames[tier] = {
    img,
    hand: await iconCrop(img, left[0].left, left[0].width, FEW.cells[0]),
    coinL: await iconCrop(img, left[1].left, left[1].width, FEW.cells[0]),
    arrows: await iconCrop(img, right[0].left, right[0].width, FEW.cells[1]),
    coinR: await iconCrop(img, right[1].left, right[1].width, FEW.cells[1])
  };
}
// inline Initiative glyph = the frame's own running-man stat icon (slot 4, above the digit)
initiativeIcon = await cutOut(await sharp(frames.golden.img).extract({ left: k(84), top: k(640), width: k(66), height: k(56) }).png().toBuffer());
// inline Health glyph = the frame's own yellow-cross stat icon (slot 3, above the digit)
healthIcon = await cutOut(await sharp(frames.golden.img).extract({ left: k(84), top: k(488), width: k(66), height: k(56) }).png().toBuffer());
const neutralTpl = await upscale(NEUTRAL_TEMPLATE);
const nIcons = await iconClusters(neutralTpl, kr(NEUTRAL.cells[0]));
if (nIcons.length < 2) throw new Error(`neutral cost icons not found: ${JSON.stringify(nIcons)}`);
const nParts = { crystal, nHand: await iconCrop(neutralTpl, nIcons[0].left, nIcons[0].width, NEUTRAL.cells[0]), nCoin: await iconCrop(neutralTpl, nIcons[1].left, nIcons[1].width, NEUTRAL.cells[0]) };

for (const u of selected) {
  const f = frames[u.tier];
  for (const side of u.sides ?? ["few", "pack"]) {
    const out = `public/assets/units-factory-${u.tier}-${u.slug}-${side}.webp`;
    writeFileSync(out, await buildFewPack(u, side, f.img, { ...parts, ...f }));
    console.log("wrote", out);
  }
  if (!u.neutral) continue;
  const out = `public/assets/${u.neutral.out ?? `units-factory-${u.tier}-${u.slug}-neutral`}.webp`;
  writeFileSync(out, await buildNeutral(u, neutralTpl, nParts));
  console.log("wrote", out);
}

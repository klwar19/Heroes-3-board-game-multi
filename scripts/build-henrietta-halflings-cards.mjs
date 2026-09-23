// Builds the Factory specialty-card LEVEL BANNER (the faction painting behind the
// I / IV / VI medallion of every native Factory specialty card) and the neutral
// Grenadiers unit card from Codex image_gen masters (tmp/gen/halfling-spec,
// gpt-6-sol via the desktop app's bundled CLI 0.155).
//
//   node scripts/build-henrietta-halflings-cards.mjs
//
// The specialty cards themselves stay the native `SpecialtyCard` render (frame,
// Factory symbol, title, text); only the level panel gains the painting — the
// printed cards carry one per town (Castle: the soft blue griffin).
// The unit card is composed over the real neutral Halflings scan: every printed
// element that changes (art window, name, Initiative digit, ability text) is
// re-covered with the template's own texture and redrawn with sharp. Outputs:
//   public/assets/specialty-card/level-art-factory.webp
//   public/assets/units-neutral-bronze-grenadiers.webp
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const GEN = "tmp/gen/halfling-spec";
const GLYPHS = "scripts/card-glyphs";
const FONT = "Times New Roman";
const CREAM = "#f4ead0";
const GOLD = "#e9c774";
const STROKE = "#22150a";

function esc(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function textSvg(text, size, fill, { bold = true, width = 2000, height = size * 2 } = {}) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<text x="0" y="${Math.round(size * 1.25)}" font-family="${FONT}" font-weight="${bold ? "bold" : "normal"}" ` +
      `font-size="${size}" fill="${fill}" stroke="${STROKE}" stroke-width="${Math.max(1, size / 22)}" paint-order="stroke" ` +
      `xml:space="preserve">${esc(text)}</text></svg>`,
  );
}

const widthCache = new Map();
async function measure(text, size) {
  const key = `${size}|${text}`;
  if (widthCache.has(key)) return widthCache.get(key);
  const { info } = await sharp(textSvg(text, size, CREAM)).trim().toBuffer({ resolveWithObject: true });
  widthCache.set(key, info.width);
  return info.width;
}

async function glyph(name, height, color) {
  let svg = readFileSync(`${GLYPHS}/${name}.svg`, "utf8");
  svg = svg.replace(/<svg\b/, `<svg color="${color}"`);
  const buf = await sharp(Buffer.from(svg)).resize({ height }).png().toBuffer();
  const meta = await sharp(buf).metadata();
  return { buf, width: meta.width, height: meta.height };
}

const GLYPH_COLORS = {
  unit_attack: GOLD,
  defense: "#8fb9ea",
};

/**
 * Word-wrap `tokens` (strings; "{glyph}" inserts a card glyph, "\n" forces a
 * break) into centred lines inside `box`, returning composite ops. Glyphs sit
 * on the baseline at ~0.95em like the printed inline icons; a pure-punctuation
 * token attaches to the previous item without a space.
 */
async function layoutText(tokens, box, size, fill, { lineGap = 1.28 } = {}) {
  const words = [];
  for (const token of tokens) {
    if (/^\{[a-z_]+\}$/.test(token)) {
      words.push({ glyph: token.slice(1, -1) });
    } else if (token === "\n") {
      words.push({ br: true });
    } else {
      for (const word of token.split(/\s+/).filter(Boolean)) words.push({ text: word });
    }
  }
  const space = (await measure("n n", size)) - (await measure("nn", size));
  const glyphH = Math.round(size * 0.95);
  const items = [];
  for (const word of words) {
    if (word.br) {
      items.push({ br: true, width: 0 });
    } else if (word.glyph) {
      const g = await glyph(word.glyph, glyphH, GLYPH_COLORS[word.glyph] ?? GOLD);
      items.push({ ...word, width: g.width + Math.round(size * 0.08), buf: g.buf, gh: g.height });
    } else {
      items.push({ ...word, width: await measure(word.text, size) });
    }
  }
  const lines = [];
  let line = [];
  let lineWidth = 0;
  for (const item of items) {
    if (item.br) {
      lines.push({ items: line, width: lineWidth });
      line = [];
      lineWidth = 0;
      continue;
    }
    item.tight = Boolean(item.text && /^[.,;:!?]+$/.test(item.text));
    const extra = line.length && !item.tight ? space : 0;
    if (line.length && !item.tight && lineWidth + extra + item.width > box.width) {
      lines.push({ items: line, width: lineWidth });
      line = [];
      lineWidth = 0;
    }
    lineWidth += (line.length && !item.tight ? space : 0) + item.width;
    line.push(item);
  }
  if (line.length) lines.push({ items: line, width: lineWidth });
  const lineH = Math.round(size * lineGap);
  const ops = [];
  let y = box.y;
  for (const l of lines) {
    let x = box.x + Math.round((box.width - l.width) / 2);
    for (const item of l.items) {
      if (item.tight) x -= space;
      if (item.glyph) {
        ops.push({ input: item.buf, left: x + 2, top: y + Math.round(size * 1.25) - item.gh + Math.round(size * 0.12) });
      } else {
        ops.push({ input: textSvg(item.text, size, fill, { width: item.width + 40, height: size * 2 }), left: x, top: y });
      }
      x += item.width + space;
    }
    y += lineH;
  }
  return { ops, bottom: y };
}

async function centredText(text, size, fill, cx, top) {
  const w = await measure(text, size);
  return { input: textSvg(text, size, fill, { width: w + 40, height: size * 2 }), left: Math.round(cx - w / 2), top };
}

/** Repeat a clean strip of the template (mirrored 2x2, seamless) over a region. */
async function tilePatch(src, strip, region) {
  const base = await sharp(src).extract(strip).png().toBuffer();
  const flop = await sharp(base).flop().png().toBuffer();
  const flip = await sharp(base).flip().png().toBuffer();
  const both = await sharp(base).flip().flop().png().toBuffer();
  const patch = await sharp({ create: { width: strip.width * 2, height: strip.height * 2, channels: 4, background: "#000" } })
    .composite([
      { input: base, left: 0, top: 0 }, { input: flop, left: strip.width, top: 0 },
      { input: flip, left: 0, top: strip.height }, { input: both, left: strip.width, top: strip.height },
    ]).png().toBuffer();
  // a tile may not exceed the region it fills (sharp composite rule)
  const tile = await sharp(patch)
    .extract({ left: 0, top: 0, width: Math.min(strip.width * 2, region.width), height: Math.min(strip.height * 2, region.height) })
    .png().toBuffer();
  const tiled = await sharp({ create: { width: region.width, height: region.height, channels: 4, background: "#000" } })
    .composite([{ input: tile, tile: true, gravity: "northwest" }])
    .png()
    .toBuffer();
  return { input: tiled, left: region.left, top: region.top };
}

async function coverInto(file, width, height, opts = {}) {
  return sharp(readFileSync(file)).resize(width, height, { fit: "cover", position: opts.position ?? "centre" }).png().toBuffer();
}

/**
 * The native card's level panel is ~68cqw x 30.4cqw (grid columns 32cqw | rest,
 * bottom row 30.4cqw) → aspect ≈ 2.2:1. Crop the 3:2 master to that, keeping the
 * emblem (centre-left) whole; the CSS draws it `cover`, medallion on the right.
 */
async function buildFactoryLevelArt() {
  const out = "public/assets/specialty-card/level-art-factory.webp";
  const result = await sharp(readFileSync(`${GEN}/factory-level-art.png`))
    .resize(1100, 500, { fit: "cover", position: "centre" })
    .webp({ quality: 88 })
    .toBuffer();
  writeFileSync(out, result);
  console.log("wrote", out, result.length, "bytes");
}

async function buildGrenadierUnit() {
  const template = "public/assets/units-neutral-bronze-halflings.webp";
  const out = "public/assets/units-neutral-bronze-grenadiers.webp";
  const src = readFileSync(template);
  const ops = [];
  // art window
  ops.push({ input: await coverInto(`${GEN}/grenadier-unit.png`, 502, 592, { position: "top" }), left: 170, top: 171 });
  // title bar: cover the old name with the bar's own clean texture, redraw
  ops.push(await tilePatch(src, { left: 540, top: 78, width: 40, height: 76 }, { left: 150, top: 78, width: 440, height: 76 }));
  ops.push(await centredText("Grenadiers", 58, CREAM, 372, 80));
  // Initiative 6 -> 7 (stat box 4)
  ops.push(await tilePatch(src, { left: 134, top: 768, width: 22, height: 50 }, { left: 88, top: 768, width: 46, height: 50 }));
  ops.push(await centredText("7", 40, CREAM, 111, 766));
  // ability text panel: warm-brown gradient cover, then the Pack Grenadier text
  const panel = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="592" height="150"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="rgb(73,47,26)"/><stop offset="1" stop-color="rgb(41,24,14)"/></linearGradient></defs>` +
      `<rect width="592" height="150" fill="url(#g)"/></svg>`,
  );
  ops.push({ input: panel, left: 76, top: 847 });
  const text = await layoutText(
    ["{unit_attack}", "Roll 2 Attack dice and resolve the higher one. If you resolve a +1 on the Attack Die, the attacked unit suffers -1", "{defense}", "(to a minimum of 0)."],
    { x: 84, y: 852, width: 576 },
    24,
    CREAM,
    { lineGap: 1.22 },
  );
  ops.push(...text.ops);
  const result = await sharp(src).composite(ops).webp({ quality: 92 }).toBuffer();
  writeFileSync(out, result);
  console.log("wrote", out, result.length, "bytes");
}

for (const f of ["factory-level-art.png", "grenadier-unit.png"]) {
  if (!existsSync(`${GEN}/${f}`)) throw new Error(`missing master ${GEN}/${f} (run tmp/gen/halfling-spec/gen-batch.ps1)`);
}
await buildFactoryLevelArt();
await buildGrenadierUnit();

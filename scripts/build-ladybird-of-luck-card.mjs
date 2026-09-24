// Ladybird of Luck (Stretch Goals minor artifact) card face.
//
// Real printed components only (see the Forge real-frame ruling): the frame is
// the REAL Ring of the Wayfarer minor-artifact scan, its title/rules/flavor
// leather is re-covered with mirrored tiles of that same scan's clean leather,
// the ongoing/instant/morale glyphs are the game glyph SVGs, and the gold icon
// is cut from the real Endless Purse of Gold scan. Codex painted ONLY the art
// window (tmp/gen/ladybird/gen-batch.ps1 → tmp/gen/ladybird/ladybird-art.png).
//
//   node scripts/build-ladybird-of-luck-card.mjs [art.png]
//
// Output: public/game-tokens/ladybird-of-luck.webp (2x of the 743x1040 print).
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const K = 2;
const k = (v) => Math.round(v * K);
const TEMPLATE = "public/assets/artifacts_minor-ring_of_the_wayfarer.webp";
// Loins of Legion has the widest text-free leather column of every minor scan.
const LEATHER_SOURCE = "public/assets/artifacts_minor-loins_of_legion.webp";
const GOLD_SOURCE = "public/assets/artifacts_major-endless_purse_of_gold.webp";
const ART = process.argv[2] ?? "tmp/gen/ladybird/ladybird-art.png";
const OUT = "public/game-tokens/ladybird-of-luck.webp";
const GLYPHS = "scripts/card-glyphs";
const FONT = "Times New Roman";
const CREAM = "#f3ecd8";
const TITLE = "#f0e2a6";
const FLAVOR = "#d9bf7a";
const GLYPH_GOLD = "#f1d77c";
const STROKE = "#1c1108";

// ---- template geometry (1x, measured on the real scan) ---------------------
const ART_BOX = { left: 64, top: 208, width: 613, height: 361 };
const TITLE_REGION = { left: 70, top: 76, width: 604, height: 122 };
const TITLE_STRIP = { left: 72, top: 78, width: 128, height: 118 };
const RULES_REGION = { left: 70, top: 582, width: 604, height: 226 };
const FLAVOR_REGION = { left: 70, top: 826, width: 604, height: 128 };
const LEATHER_STRIP = { left: 74, top: 592, width: 86, height: 206 };
const OR_DIVIDER = { left: 280, top: 682, width: 184, height: 24 };
const SEPARATOR = { left: 88, top: 806, width: 568, height: 12 };
const GOLD_ICON = { left: 412, top: 600, width: 56, height: 42 };

const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function textSvg(text, size, fill, { italic = false, bold = false, width, stroke = true } = {}) {
  const w = Math.ceil(width ?? size * text.length);
  const h = Math.ceil(size * 1.6);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<defs><filter id="s" x="-10%" y="-10%" width="120%" height="140%"><feDropShadow dx="0" dy="${size / 26}" stdDeviation="${size / 28}" flood-color="#000" flood-opacity=".8"/></filter></defs>` +
      `<text x="${size * 0.1}" y="${Math.round(size * 1.15)}" font-family="${FONT}" font-size="${size}"` +
      `${bold ? ' font-weight="bold"' : ""}${italic ? ' font-style="italic"' : ""} fill="${fill}"` +
      (stroke ? ` stroke="${STROKE}" stroke-width="${Math.max(1, size / 26)}" paint-order="stroke"` : "") +
      ` filter="url(#s)" xml:space="preserve">${esc(text)}</text></svg>`
  );
}
const widths = new Map();
async function measure(text, size, opts = {}) {
  const key = `${size}|${opts.italic}|${opts.bold}|${text}`;
  if (!widths.has(key)) {
    const { info } = await sharp(textSvg(text, size, "#fff", { ...opts, width: size * text.length + 40 }))
      .trim()
      .toBuffer({ resolveWithObject: true });
    widths.set(key, info.width);
  }
  return widths.get(key);
}

async function glyph(name, height) {
  const svg = readFileSync(`${GLYPHS}/${name}.svg`, "utf8").replace(
    /<svg\b/,
    `<svg color="${GLYPH_GOLD}" fill="${GLYPH_GOLD}"`
  );
  const buf = await sharp(Buffer.from(svg), { density: 600 }).resize({ height }).png().toBuffer();
  const m = await sharp(buf).metadata();
  return { buf, width: m.width, height: m.height };
}

/** The printed gold-coins icon, keyed off its leather by luminance. */
async function goldIcon(height) {
  const { data, info } = await sharp(GOLD_SOURCE)
    .extract(GOLD_ICON)
    .resize({ height: height * 2, kernel: "lanczos3" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2];
    const sat = Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
    // Coins are bright yellow; the purse leather is dark brown.
    const a = Math.max(0, Math.min(1, (lum - 55) / 25)) * Math.max(0.75, Math.min(1, sat / 40));
    data[i + 3] = Math.round(255 * a);
  }
  const keyed = await sharp(data, { raw: info }).png().toBuffer();
  const trimmed = await sharp(keyed).trim({ threshold: 5 }).resize({ height }).png().toBuffer();
  const m = await sharp(trimmed).metadata();
  return { buf: trimmed, width: m.width, height: m.height };
}

/** A printed gold ornament (the OR divider) keyed off its leather by luminance. */
async function keyedCrop(img, region) {
  const { data, info } = await sharp(img).extract(region).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2];
    data[i + 3] = Math.round(255 * Math.max(0, Math.min(1, (lum - 85) / 45)));
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

/** Seamless mirrored tile of a clean strip of the (2x) template over a region. */
async function tilePatch(img, strip, region) {
  const base = await sharp(img).extract(strip).png().toBuffer();
  const flop = await sharp(base).flop().png().toBuffer();
  const flip = await sharp(base).flip().png().toBuffer();
  const both = await sharp(base).flip().flop().png().toBuffer();
  const patch = await sharp({ create: { width: strip.width * 2, height: strip.height * 2, channels: 4, background: "#000" } })
    .composite([
      { input: base, left: 0, top: 0 },
      { input: flop, left: strip.width, top: 0 },
      { input: flip, left: 0, top: strip.height },
      { input: both, left: strip.width, top: strip.height }
    ])
    .png()
    .toBuffer();
  const tile = await sharp(patch)
    .extract({ left: 0, top: 0, width: Math.min(strip.width * 2, region.width), height: Math.min(strip.height * 2, region.height) })
    .png()
    .toBuffer();
  const input = await sharp({ create: { width: region.width, height: region.height, channels: 4, background: "#000" } })
    .composite([{ input: tile, tile: true, gravity: "northwest" }])
    .png()
    .toBuffer();
  return { input, left: region.left, top: region.top };
}
const kr = (r) => ({ left: k(r.left), top: k(r.top), width: k(r.width), height: k(r.height) });

/**
 * One centred line of mixed text / icons. Items: string | { icon }. Returns
 * composite ops with the line's baseline at `top + size * 1.15`.
 */
async function line(items, size, cx, top, opts = {}) {
  const space = (await measure("n n", size, opts)) - (await measure("nn", size, opts));
  const iconH = Math.round(size * 1.12);
  const parts = [];
  for (const item of items) {
    if (typeof item === "string") {
      parts.push({ text: item, width: await measure(item, size, opts) });
    } else {
      const g = item.icon === "gold" ? await goldIcon(Math.round(size * 1.05)) : await glyph(item.icon, iconH);
      parts.push({ ...g, icon: item.icon });
    }
  }
  const gapBefore = (p, i) => (i === 0 || (p.text !== undefined && /^[.,;:]$/.test(p.text)) ? 0 : space);
  const total = parts.reduce((sum, p, i) => sum + p.width + gapBefore(p, i), 0);
  let x = Math.round(cx - total / 2);
  const baseline = top + Math.round(size * 1.15);
  const ops = [];
  for (const [i, p] of parts.entries()) {
    x += gapBefore(p, i);
    if (p.text !== undefined) {
      ops.push({ input: textSvg(p.text, size, opts.fill ?? CREAM, { ...opts, width: p.width + size }), left: x - Math.round(size * 0.1), top });
    } else {
      ops.push({ input: p.buf, left: x, top: baseline - p.height + Math.round(size * 0.12) });
    }
    x += p.width;
  }
  return ops;
}

async function main() {
  const base = await sharp(TEMPLATE).resize(k(743), k(1040), { kernel: "lanczos3" }).png().toBuffer();
  const ops = [];

  // Art window: Codex painting, cover-cropped (keep the whole statue in view).
  const art = await sharp(ART)
    .resize(k(ART_BOX.width), k(ART_BOX.height), { fit: "cover", position: "centre" })
    .png()
    .toBuffer();
  ops.push({ input: art, left: k(ART_BOX.left), top: k(ART_BOX.top) });

  // Leather re-covers from the scan's own clean leather.
  ops.push(await tilePatch(base, kr(TITLE_STRIP), kr(TITLE_REGION)));
  const leather = await sharp(LEATHER_SOURCE).resize(k(743), k(1040), { kernel: "lanczos3" }).png().toBuffer();
  ops.push(await tilePatch(leather, kr(LEATHER_STRIP), kr(RULES_REGION)));
  ops.push(await tilePatch(leather, kr(LEATHER_STRIP), kr(FLAVOR_REGION)));
  // Keep the printed gold separator line between rules and flavor.
  ops.push({ input: await sharp(base).extract(kr(SEPARATOR)).png().toBuffer(), left: k(SEPARATOR.left), top: k(SEPARATOR.top) });

  // Title.
  const titleSize = k(56);
  ops.push(...(await line(["Ladybird of Luck"], titleSize, k(372), k(98), { bold: true, fill: TITLE })));

  // Rules: ⟳ ongoing side, the printed "— OR —" divider, ⚡ instant side.
  const size = k(26.5);
  const lh = k(31);
  let y = k(588);
  ops.push(...(await line([{ icon: "ongoing" }, "Place this card on an empty space."], size, k(372), y)));
  y += lh;
  ops.push(...(await line(["It counts as a Wall until the end of the"], size, k(372), y)));
  y += lh;
  ops.push(...(await line(["combat. If this card is removed by an attack,"], size, k(372), y)));
  y += lh;
  ops.push(...(await line(["you gain 2", { icon: "gold" }, "and discard this card."], size, k(372), y)));
  y += lh + k(6);
  const divider = await keyedCrop(base, kr(OR_DIVIDER));
  ops.push({ input: divider, left: k(OR_DIVIDER.left), top: y });
  y += k(OR_DIVIDER.height) + k(2);
  ops.push(...(await line([{ icon: "instant" }, "Gain a", { icon: "morale_positive" }, "."], size, k(372), y)));

  // Flavor (printed card text, italic gold).
  const flavorSize = k(25);
  ops.push(...(await line(["An old witch who seems to have been expecting"], flavorSize, k(372), k(850), { italic: true, fill: FLAVOR, stroke: false })));
  ops.push(...(await line(["you, hands you a small statue."], flavorSize, k(372), k(882), { italic: true, fill: FLAVOR, stroke: false })));

  const out = await sharp(base).composite(ops).webp({ quality: 85, effort: 6, smartSubsample: true }).toBuffer();
  writeFileSync(OUT, out);
  console.log(`${OUT} ${out.length} bytes`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

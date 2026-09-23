#!/usr/bin/env node
// Builds the printed Forge hero boards (boardScan) over the REAL Castle hero
// board scans: Catherine (might, horned-helmet class icon) for Dark Mullich and
// Rion (magic, wizard-hat class icon) for Zeestral.
//
//   node scripts/build-forge-hero-boards.mjs
//
// The Castle blue is recoloured to the official Forge WIP boards' palette
// (maroon name banner, bronze-brown frame, grey marble level track); the old
// name, class, stat digits, ability label/picture and specialty picture/name
// are re-covered with the board's own texture and redrawn. Ability pictures are
// the real Logistics / Intelligence card art; portraits and specialty symbols
// are the Forge Codex masters (generated-session-art/forge/heroes).
// Output: public/assets/heroes-forge-<might|magic>-<hero>.webp (1593x1133)
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const SRC = "generated-session-art/forge/heroes";
const FONT = "Times New Roman";
const heroes = [
  { id: "dark_mullich", name: "Dark Mullich", klass: "Cyborg", type: "might", template: "public/assets/heroes-castle-might-catherine.webp",
    stats: [3, 1, 1, 1], ability: "Logistics", abilityCard: "public/assets/abilities-logistics.webp", specialty: "Overclock",
    digits: [[813, 836], [1031, 1055], [1259, 1267], [1478, 1485]], nameBox: [963, 89, 1240, 125], label: [785, 344, 981, 374] },
  { id: "zeestral", name: "Zeestral", klass: "Techno Pagan", type: "magic", template: "public/assets/heroes-castle-magic-rion.webp",
    stats: [1, 0, 2, 2], ability: "Intelligence", abilityCard: "public/assets/abilities-intelligence.webp", specialty: "Storm Circuit",
    digits: [[822, 835], [1035, 1060], [1254, 1277], [1474, 1497]], nameBox: [1046, 93, 1169, 128], label: [814, 348, 956, 370] }
];
const PORTRAIT = { left: 66, top: 70, width: 602, height: 602 };
const BANNER = { x0: 678, y0: 71, x1: 1533, y1: 198 };
const STATS_ROW = { x0: 678, y0: 200, x1: 1530, y1: 326 };
const PANEL = { left: 688, top: 330, width: 842, height: 338 };
const SPEC_FRAME = { left: 1189, top: 391, width: 210, height: 206 };
const ABILITY_PIC = { left: 752, top: 387, width: 258, height: 246 };
const SPEC_INNER = { left: 1201, top: 402, width: 185, height: 182 };
const LEATHER = { left: 1025, top: 400, width: 150, height: 190 };
const TRACK_Y = 690;

const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function textSvg(text, size, fill, { stroke = "#1b0f07", shadow = true } = {}) {
  const w = Math.ceil(size * text.length * 0.75 + size);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${Math.ceil(size * 1.7)}">` +
    `<defs><filter id="s"><feDropShadow dx="0" dy="${size / 22}" stdDeviation="${size / 26}" flood-color="#000" flood-opacity="${shadow ? 0.8 : 0}"/></filter></defs>` +
    `<text x="${w / 2}" y="${Math.round(size * 1.2)}" text-anchor="middle" font-family="${FONT}" font-weight="bold" font-size="${size}" fill="${fill}" stroke="${stroke}" stroke-width="${Math.max(1, size / 26)}" paint-order="stroke" filter="url(#s)" xml:space="preserve">${esc(text)}</text></svg>`);
}
async function centred(text, size, fill, cx, cy, opts) {
  const buf = textSvg(text, size, fill, opts);
  const m = await sharp(buf).metadata();
  return { input: buf, left: Math.round(cx - m.width / 2), top: Math.round(cy - size * 0.85) };
}
async function tilePatch(img, strip, region) {
  const base = await sharp(img).extract(strip).png().toBuffer();
  const flop = await sharp(base).flop().png().toBuffer();
  const flip = await sharp(base).flip().png().toBuffer();
  const both = await sharp(base).flip().flop().png().toBuffer();
  const patch = await sharp({ create: { width: strip.width * 2, height: strip.height * 2, channels: 4, background: "#000" } })
    .composite([{ input: base, left: 0, top: 0 }, { input: flop, left: strip.width, top: 0 }, { input: flip, left: 0, top: strip.height }, { input: both, left: strip.width, top: strip.height }]).png().toBuffer();
  const tile = await sharp(patch).extract({ left: 0, top: 0, width: Math.min(strip.width * 2, region.width), height: Math.min(strip.height * 2, region.height) }).png().toBuffer();
  const input = await sharp({ create: { width: region.width, height: region.height, channels: 4, background: "#000" } }).composite([{ input: tile, tile: true, gravity: "northwest" }]).png().toBuffer();
  return { input, left: region.left, top: region.top };
}
function feather(w, h, r = 18) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><filter id="b"><feGaussianBlur stdDeviation="${r / 2}"/></filter></defs><rect x="${r}" y="${r}" width="${w - 2 * r}" height="${h - 2 * r}" rx="${r}" fill="#fff" filter="url(#b)"/></svg>`);
}

function rgb2hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx];
}
function hsv2rgb(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
/** Castle blue → Forge palette, outside the portrait / stats row / picture panel. */
async function recolour(buf) {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const inside = (x, y, r) => x >= r.left && x < r.left + r.width && y >= r.top && y < r.top + r.height;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (inside(x, y, PORTRAIT)) continue;
    if (x >= STATS_ROW.x0 && x <= STATS_ROW.x1 && y >= STATS_ROW.y0 && y <= STATS_ROW.y1) continue;
    if (x >= 700 && x <= 1530 && y > STATS_ROW.y1 && y < 672) continue; // leather ability/specialty panel
    const i = (y * info.width + x) * info.channels;
    const [h, s, v] = rgb2hsv(data[i], data[i + 1], data[i + 2]);
    if (h < 165 || h > 265 || s < 0.12) continue;
    let out;
    if (x >= BANNER.x0 && x <= BANNER.x1 && y >= BANNER.y0 && y <= BANNER.y1) out = hsv2rgb(353, Math.min(1, s * 1.05), v * 0.66);
    else if (y >= TRACK_Y) out = hsv2rgb(30, s * 0.1, v * 0.92);
    else out = hsv2rgb(28, s * 0.55, v * 0.78);
    data[i] = out[0]; data[i + 1] = out[1]; data[i + 2] = out[2];
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

for (const hero of heroes) {
  let img = await sharp(readFileSync(hero.template)).png().toBuffer();
  const ops = [];
  // erase old name / class / digits / ability label & picture / specialty name
  const [, ny0, nx1, ny1] = hero.nameBox;
  ops.push(await tilePatch(img, { left: nx1 + 60, top: ny0 - 4, width: 40, height: ny1 - ny0 + 8 }, { left: 720, top: ny0 - 4, width: 700, height: ny1 - ny0 + 8 }));
  ops.push(await tilePatch(img, { left: 1250, top: 144, width: 40, height: 32 }, { left: 900, top: 144, width: 420, height: 32 }));
  for (const [d0, d1] of hero.digits) ops.push(await tilePatch(img, { left: d1 + 6, top: 240, width: 12, height: 48 }, { left: d0 - 8, top: 240, width: d1 - d0 + 14, height: 48 }));
  // the whole ability/specialty leather panel is re-tiled evenly, then the real
  // printed specialty frame is put back on top
  const frame = await sharp(img).extract(SPEC_FRAME).png().toBuffer();
  ops.push(await tilePatch(img, LEATHER, PANEL));
  ops.push({ input: frame, left: SPEC_FRAME.left, top: SPEC_FRAME.top });
  img = await sharp(img).composite(ops).png().toBuffer();
  img = await recolour(img);

  const draw = [];
  // portrait
  draw.push({ input: await sharp(readFileSync(`${SRC}/${hero.id}-portrait.png`)).resize(PORTRAIT.width, PORTRAIT.height, { fit: "cover", position: "north" }).png().toBuffer(), left: PORTRAIT.left, top: PORTRAIT.top });
  // name + class
  draw.push(await centred(hero.name, 50, "#f1d98e", 1106, 114));
  draw.push(await centred(hero.klass, 30, "#f4ead0", 1106, 166));
  // stats
  for (let i = 0; i < 4; i++) {
    const [d0, d1] = hero.digits[i];
    draw.push(await centred(String(hero.stats[i]), 52, "#f4ead0", Math.round((d0 + d1) / 2), 272));
  }
  // ability label + real ability-card picture
  draw.push(await centred(hero.ability, 36, "#e7c86f", 885, 368));
  const card = sharp(readFileSync(hero.abilityCard));
  const cm = await card.metadata();
  const pic = await sharp(readFileSync(hero.abilityCard)).extract({ left: Math.round(cm.width * 0.3), top: Math.round(cm.height * 0.1), width: Math.round(cm.width * 0.4), height: Math.round(cm.height * 0.28) })
    .resize(ABILITY_PIC.width, ABILITY_PIC.height, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const picMasked = await sharp(pic).composite([{ input: feather(ABILITY_PIC.width, ABILITY_PIC.height, 16), blend: "dest-in" }]).png().toBuffer();
  draw.push({ input: picMasked, left: ABILITY_PIC.left, top: ABILITY_PIC.top });
  // specialty picture: symbol on a dark forge backdrop inside the printed frame
  const back = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SPEC_INNER.width}" height="${SPEC_INNER.height}"><defs><radialGradient id="g" cx=".5" cy=".45" r=".7"><stop offset="0" stop-color="#4a3a30"/><stop offset="1" stop-color="#140e0b"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`);
  const sym = await sharp(readFileSync(`${SRC}/${hero.id}-symbol.png`)).trim().resize(SPEC_INNER.width - 16, SPEC_INNER.height - 16, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  draw.push({ input: await sharp(back).composite([{ input: sym, left: 8, top: 8 }]).png().toBuffer(), left: SPEC_INNER.left, top: SPEC_INNER.top });
  draw.push(await centred("Specialty", 36, "#e7c86f", 1297, 368));
  draw.push(await centred(hero.specialty, 34, "#f4ead0", 1297, 632));

  const out = `public/assets/heroes-forge-${hero.type}-${hero.id}.webp`;
  writeFileSync(out, await sharp(img).composite(draw).webp({ quality: 92 }).toBuffer());
  console.log("wrote", out);
}

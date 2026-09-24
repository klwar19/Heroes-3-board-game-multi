// Eikthurn IV (Mountain Rams) card face: replace the printed rules text with the
// 2026-09-24 ruling ("gain 3 Runes, doubled for Mountain Rams"). The old text is
// covered with a mirror-tiled patch of the card's OWN plain leather (left of the
// ram), feathered into the panel, then the new text is drawn in the same gold
// serif style. Source: generated-session-art/bulwark/specialty/*.orig.webp.
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const SRC = "generated-session-art/bulwark/specialty/hero_specialties-eikthurn-4.orig.webp";
const OUT = "public/assets/hero_specialties-eikthurn-4.webp";
const AREA = { left: 120, top: 668, width: 860, height: 310 };
const PATCH = { left: 100, top: 110, width: 215, height: 400 };

const src = readFileSync(SRC);
const patch = await sharp(src).extract(PATCH).toBuffer();
const flopped = await sharp(patch).flop().toBuffer();
const tiles = [];
for (let x = 0, i = 0; x < AREA.width; x += PATCH.width, i += 1) {
  tiles.push({ input: i % 2 ? flopped : patch, left: x, top: 0 });
}
const strip = await sharp({ create: { width: Math.ceil(AREA.width / PATCH.width) * PATCH.width, height: PATCH.height, channels: 3, background: "#5a3a1f" } })
  .composite(tiles).png().toBuffer();
const fill = await sharp(strip).extract({ left: 0, top: 40, width: AREA.width, height: AREA.height }).modulate({ brightness: 0.94 }).png().toBuffer();
// Feathered alpha so the patch melts into the panel.
const feather = 44;
const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${AREA.width}" height="${AREA.height}">
  <defs><filter id="b"><feGaussianBlur stdDeviation="${feather / 2}"/></filter></defs>
  <rect x="${feather}" y="${feather}" width="${AREA.width - 2 * feather}" height="${AREA.height - 2 * feather}" fill="#fff" filter="url(#b)"/></svg>`);
const maskAlpha = await sharp(mask).resize(AREA.width, AREA.height).extractChannel(0).toBuffer();
const fillWithAlpha = await sharp(fill).removeAlpha().joinChannel(maskAlpha).png().toBuffer();

const lines = ["Instant: When your unit attacks,", "you gain 3 Runes.", "For Mountain Rams, gain", "6 Runes instead."];
const size = 50, lineH = 60;
const cx = 1099 / 2;
const top = 740;
const text = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1099" height="1431">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1b8"/><stop offset="1" stop-color="#e2b95a"/></linearGradient>
    <filter id="s" x="-5%" y="-20%" width="110%" height="140%"><feDropShadow dx="2" dy="3" stdDeviation="2" flood-color="#1a0d04" flood-opacity=".9"/></filter>
  </defs>
  <g font-family="Times New Roman, serif" font-weight="bold" font-size="${size}" text-anchor="middle" fill="url(#g)" stroke="#2a1606" stroke-width="1.4" paint-order="stroke" filter="url(#s)" xml:space="preserve">
    ${lines.map((line, i) => `<text x="${cx}" y="${top + i * lineH}">${line}</text>`).join("\n    ")}
  </g></svg>`);

const out = await sharp(src)
  .composite([{ input: fillWithAlpha, left: AREA.left, top: AREA.top }, { input: text, left: 0, top: 0 }])
  .webp({ quality: 90, effort: 6 })
  .toBuffer();
writeFileSync(OUT, out);
console.log(`wrote ${OUT} (${out.length} bytes)`);

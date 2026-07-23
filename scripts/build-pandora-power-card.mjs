#!/usr/bin/env node
/**
 * Builds the ONE Pandora's Box card face the official scan set is missing —
 * pandora.power_or_morale (card 178, "Pandora's Bargain: Power") — by
 * compositing the set's shared frame (taken from the hand_size scan, card 175:
 * same "Pandora's Box" title, box art and leather rules panel) with the card's
 * own printed rules text and the game's real symbol icons:
 *
 *   ∞  +1 [power book].
 *   As long as this card is in play, at the end of your turn,
 *   remove this card or gain [negative morale].
 *
 * The donor card's rules text is covered with mirror-tiled clean leather
 * sampled from the same panel, and the footer card number is re-stamped
 * 175/197 → 178/197. Output: public/assets/pandora/power_or_morale.webp
 * (620×869, same size/format as the rest of the set).
 *
 * Run:  node scripts/build-pandora-power-card.mjs
 */
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const asset = (...parts) => path.join(root, "public", "assets", ...parts);

const TEMPLATE = asset("pandora", "hand_size.webp");
const POWER_ICON = asset("icons", "symbol-power.webp");
const MORALE_ICON = asset("icons", "symbol-morale-negative.webp");
const OUT = asset("pandora", "power_or_morale.webp");

const W = 620;
const H = 869;

/** Cream rules-text color sampled from the scans, with their soft dark shadow. */
const INK = "#f2e7c8";
const SHADOW = "#241505";
const FONT = "Palatino Linotype, 'Book Antiqua', Georgia, serif";

async function main() {
  const template = sharp(TEMPLATE);

  // --- 1. Cover the donor card's rules text with clean leather -------------
  // Clean band just below the art divider (above the donor's first text line),
  // mirror-tiled downward so the grain meets seamlessly at each seam.
  const band = { left: 48, top: 496, width: 524, height: 72 };
  const bandBuf = await template.clone().extract(band).toBuffer();
  const bandFlipped = await sharp(bandBuf).flip().toBuffer();
  const coverTop = 572;
  const coverHeight = 158; // through the donor's last text row
  const leatherPatches = [];
  for (let offset = 0, i = 0; offset < coverHeight; offset += band.height, i += 1) {
    const sliceHeight = Math.min(band.height, coverHeight - offset);
    const source = i % 2 === 0 ? bandBuf : bandFlipped;
    const slice =
      sliceHeight === band.height
        ? source
        : await sharp(source).extract({ left: 0, top: 0, width: band.width, height: sliceHeight }).toBuffer();
    leatherPatches.push({ input: slice, left: band.left, top: coverTop + offset });
  }

  // --- 2. Re-stamp the footer card number 175/197 → 178/197 ----------------
  // Cover the old number by tiling the blank marble strip between the number
  // and the "© 2024 Archon." credit (guaranteed text-free in the donor), then
  // draw the new number in the footer's small sans.
  const numberRect = { left: 158, top: 845, width: 80, height: 24 };
  const blankStrip = await template
    .clone()
    .extract({ left: 240, top: numberRect.top, width: 26, height: numberRect.height })
    .toBuffer();
  const blankFooter = await sharp({
    create: { width: numberRect.width, height: numberRect.height, channels: 3, background: "#000000" }
  })
    .composite(
      Array.from({ length: Math.ceil(numberRect.width / 26) }, (_, i) => ({
        input: blankStrip,
        left: Math.min(i * 26, numberRect.width - 26),
        top: 0
      }))
    )
    .png()
    .toBuffer();
  const footerSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
       <text x="${numberRect.left + 4}" y="862" font-family="Segoe UI, Arial, sans-serif"
             font-size="18" fill="#f2f2f2">178/197</text>
     </svg>`
  );

  // --- 3. The card's own rules text -----------------------------------------
  // Inline icons are composited as raster layers; the SVG carries the words.
  // Shadow first (offset dark copy), then the cream ink — the scans' look.
  const line1Y = 617; // baseline, matches the donor's first-line position
  const bodyYs = [672, 706, 740];
  const textSpec = [
    // [x, y, anchor, size, text]
    [258, line1Y, "end", 30, "∞  +1"],
    [311, line1Y, "start", 30, "."],
    [310, bodyYs[0], "middle", 24, "As long as this card is in play, at the"],
    [310, bodyYs[1], "middle", 24, "end of your turn, remove this card"],
    [281, bodyYs[2], "end", 24, "or gain"],
    [334, bodyYs[2], "start", 24, "."]
  ];
  const textLayer = (dx, dy, fill, opacity) =>
    textSpec
      .map(
        ([x, y, anchor, size, text]) =>
          `<text x="${x + dx}" y="${y + dy}" text-anchor="${anchor}" font-family="${FONT}"
                 font-size="${size}" fill="${fill}" fill-opacity="${opacity}">${text}</text>`
      )
      .join("\n");
  const rulesSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
       ${textLayer(1.5, 1.8, SHADOW, 0.75)}
       ${textLayer(0, 0, INK, 1)}
     </svg>`
  );

  // The power book inline in line 1 ("+1 [book]."), the dark morale plaque
  // inline in the last body line ("or gain [morale]."). Heights tuned to the
  // surrounding text size, like the printed inline symbols.
  const powerIcon = await sharp(POWER_ICON).resize({ height: 40 }).toBuffer();
  const powerMeta = await sharp(powerIcon).metadata();
  const moraleIcon = await sharp(MORALE_ICON).resize({ height: 32 }).toBuffer();
  const moraleMeta = await sharp(moraleIcon).metadata();

  await template
    .clone()
    .composite([
      ...leatherPatches,
      { input: blankFooter, left: numberRect.left, top: numberRect.top },
      { input: footerSvg, left: 0, top: 0 },
      { input: rulesSvg, left: 0, top: 0 },
      { input: powerIcon, left: 268, top: line1Y - 31 },
      { input: moraleIcon, left: 288, top: bodyYs[2] - 24 },
      // never used below; placeholders removed
    ].filter(Boolean))
    .webp({ quality: 92 })
    .toFile(OUT);

  console.log(`wrote ${OUT} (${W}x${H}); power icon ${powerMeta.width}px, morale icon ${moraleMeta.width}px wide`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

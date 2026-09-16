#!/usr/bin/env node
/**
 * Polish Balance Pack — 2026-09-16 user-supplied reprints:
 *   Ballistics (basic now "at the beginning of a combat round") and the four
 *   Basic <School> Magic cards (basic now "find the first two <School> Magic
 *   spells, choose one, then reshuffle").
 *
 *   node scripts/build-polish-balance-empowered-derived.mjs
 *
 * Masters: scripts/card-art/raw/polish-balance-2026-09-16/*.webp — the author's
 * card images exactly as supplied (webp, ~1060×1480). Published through the
 * `--sources` media family, so re-runs are reproducible from a fresh clone.
 *
 * Outputs (public/assets/polish-balance/, the repo card-face size 743×1040,
 * q65 — the balance-reprint band of scripts/compress-media.mjs):
 *   <id>.webp            — the master, resized. Nothing else touched.
 *   <id>-empowered.webp  — DERIVED empowered face (user request: "both effects
 *                          to choose, no crown"): the master with the expert
 *                          crown medallion patched out (a background+divider
 *                          strip from the same card covers it, so the section
 *                          line runs unbroken) and a gold "OR" set on the
 *                          divider — every printed arm is choosable. No other
 *                          Empowered chrome: the render surfaces already draw
 *                          the gold ring + "Empowered" badge on top.
 *
 * The previous ability-ballistics-empowered.webp (an authored face) printed the
 * OLD basic text ("at the beginning of Combat") and dropped the basic siege
 * arm, so it is deliberately replaced by this derivation of the new card.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "scripts", "card-art", "raw", "polish-balance-2026-09-16");
const OUT = path.join(ROOT, "public", "assets", "polish-balance");

const CARD_W = 743;
const CARD_H = 1040;

/**
 * Per-master geometry, measured on the supplied images (all ~1060-1064 wide):
 * - strip: a clean background band LEFT of the medallion that contains the
 *   horizontal section divider at the same rows — tiled over the medallion it
 *   erases the crown and reconnects the line seamlessly.
 * - cover: the x-range the pasted strip must span (medallion ± margin).
 * - orY: the divider-line y the "OR" is centred on.
 */
const CARDS = [
  {
    id: "ability-ballistics",
    // Basic siege text ends ~y1000; the expert ⚡ icon's tip begins ~y1124 —
    // the strip must stop ABOVE it or its top gets copied over the seam.
    strip: { left: 140, top: 1004, height: 118 },
    cover: { left: 432, width: 200 },
    orY: 1068
  },
  ...["air", "fire", "water", "earth"].map((school) => ({
    id: `ability-basic_${school}_magic`,
    strip: { left: 140, top: 1012, height: 120 },
    cover: { left: 432, width: 200 },
    orY: 1068
  }))
];

/** Gold serif "OR" matching the cards' in-text section alternatives. */
function orSvg(width, height, x, y) {
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <text x="${x}" y="${y}" text-anchor="middle"
        font-family="Times New Roman, Georgia, serif" font-size="46" font-weight="bold"
        fill="#e7c56a" stroke="#191008" stroke-width="7" paint-order="stroke"
        letter-spacing="2">OR</text>
    </svg>`
  );
}

async function buildCard({ id, strip, cover, orY }) {
  const master = path.join(SRC, `${id}.webp`);
  const meta = await sharp(master).metadata();

  // Base face: the master as supplied, at the repo card size.
  await sharp(master)
    .resize(CARD_W, CARD_H, { fit: "fill" })
    .webp({ quality: 65, alphaQuality: 90, effort: 6, smartSubsample: true })
    .toFile(path.join(OUT, `${id}.webp`));

  // Empowered face: patch the crown medallion out, then set "OR" on the line.
  const stripBuf = await sharp(master)
    .extract({ left: strip.left, top: strip.top, width: cover.width, height: strip.height })
    .png()
    .toBuffer();
  const edited = await sharp(master)
    .composite([
      { input: stripBuf, left: cover.left, top: strip.top },
      { input: orSvg(meta.width, meta.height, Math.round(meta.width / 2), orY + 16), left: 0, top: 0 }
    ])
    .png()
    .toBuffer();
  await sharp(edited)
    .resize(CARD_W, CARD_H, { fit: "fill" })
    .webp({ quality: 65, alphaQuality: 90, effort: 6, smartSubsample: true })
    .toFile(path.join(OUT, `${id}-empowered.webp`));

  console.log(`built ${id}.webp + ${id}-empowered.webp`);
}

for (const card of CARDS) {
  await buildCard(card);
}

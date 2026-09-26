#!/usr/bin/env node
/**
 * Hex Battlefield siege set for the FORGE (no PC original): Codex paintings of
 * the whole fortress, cut into the PC siege pieces.
 *
 * The Forge's fortress is laid out exactly like the Factory's (HotA) siege set:
 * Codex repainted a composite of the Factory pieces (intact, and a second
 * composite of the ruins) as the Forge — riveted iron over basalt, brass pipes,
 * Tesla-coil turrets, the Toxic Moat — keeping every wall, tower, gate and keep
 * in place, plus the siege backdrop on its own (no fortifications, so a broken
 * wall shows open ground, not a painted wall). Each piece here is the painting
 * cut with the Factory piece's own alpha at its PC spot, so the pieces fit the
 * scene code (hex-battlefield.tsx HexSiegeScene) and the printed Wall / Gate
 * tokens exactly like every other town.
 *
 * The references were the 800x556 PC scene padded to 3:2 (834x556) and Codex
 * painted them 1536x1024, so one PC pixel is 1536/834 master pixels; pieces are
 * written at that resolution (≈1.84× the PC art — sharper on large screens).
 *
 *   node scripts/build-forge-siege-art.mjs
 *
 * Masters (gitignored): generated-session-art/forge/siege/forge-siege-{back,intact,ruin}.png
 * Output: public/assets/battle-hex/siege/forge/*.webp (run `npm run media:publish`)
 * and the `forge` entry of src/data/battle-hex/siege-art.json.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
sharp.cache(false);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MASTERS = path.join(ROOT, "generated-session-art", "forge", "siege");
const LAYOUT_TOWN = "factory";
const LAYOUT_DIR = path.join(ROOT, "public", "assets", "battle-hex", "siege", LAYOUT_TOWN);
const OUT_DIR = path.join(ROOT, "public", "assets", "battle-hex", "siege", "forge");
const ART_FILE = path.join(ROOT, "src", "data", "battle-hex", "siege-art.json");
/** Master pixels per PC pixel (834-wide padded reference painted 1536 wide). */
const SCALE = 1536 / 834;
/** The keep's guard: the Forge's shooter (Grunts, a ranged unit). */
const GUARD_SPRITE = "forge-grunt";

const art = JSON.parse(fs.readFileSync(ART_FILE, "utf8"));
const layout = art[LAYOUT_TOWN];
if (!layout) throw new Error(`siege-art.json has no ${LAYOUT_TOWN} layout`);

const masters = {
  back: path.join(MASTERS, "forge-siege-back.png"),
  intact: path.join(MASTERS, "forge-siege-intact.png"),
  ruin: path.join(MASTERS, "forge-siege-ruin.png")
};
for (const file of Object.values(masters)) {
  if (!fs.existsSync(file)) throw new Error(`missing master ${path.relative(ROOT, file)}`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const webp = { quality: 86, alphaQuality: 90, effort: 6, smartSubsample: true };
const px = (value) => Math.round(value * SCALE);

// The backdrop: the whole PC scene (800x556), no fortifications.
{
  const out = path.join(OUT_DIR, "back.webp");
  await sharp(masters.back).extract({ left: 0, top: 0, width: px(800), height: px(556) }).webp(webp).toFile(out);
  console.log("back", px(800), px(556));
}

for (const [name, piece] of Object.entries(layout.pieces)) {
  if (name === "back") continue;
  const master = name.endsWith("-ruin") ? masters.ruin : masters.intact;
  const left = px(piece.x);
  const top = px(piece.y);
  const width = Math.min(px(piece.x + piece.width), px(834)) - left;
  const height = Math.min(px(piece.y + piece.height), px(556)) - top;
  // The Factory piece's alpha, scaled to the master's resolution (its soft
  // edge scales with it), is the cut.
  const mask = await sharp(path.join(LAYOUT_DIR, `${name}.webp`))
    .resize(width, height, { fit: "fill", kernel: "lanczos3" })
    .ensureAlpha()
    .extractChannel("alpha")
    .raw()
    .toBuffer();
  const rgb = await sharp(master).extract({ left, top, width, height }).removeAlpha().raw().toBuffer();
  const rgba = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    rgba[index * 4] = rgb[index * 3];
    rgba[index * 4 + 1] = rgb[index * 3 + 1];
    rgba[index * 4 + 2] = rgb[index * 3 + 2];
    rgba[index * 4 + 3] = mask[index];
  }
  await sharp(rgba, { raw: { width, height, channels: 4 } })
    .webp(webp)
    .toFile(path.join(OUT_DIR, `${name}.webp`));
  console.log(name, width, height);
}

// Same PC layout as the Factory (the pieces were cut to it); own guard.
art.forge = {
  pieces: layout.pieces,
  keepGuard: layout.keepGuard,
  guardSprite: GUARD_SPRITE
};
fs.writeFileSync(ART_FILE, `${JSON.stringify(art, null, 2)}\n`);
console.log("siege-art.json: forge");

#!/usr/bin/env node
/**
 * Convert the real Heroes III board-game asset scans (downloaded from
 * github.com/Heegu-sama/Homm3BG — assets/images, assets/cards, assets/skills)
 * into the .webp files the app consumes under public/assets. Re-run after
 * refreshing the staged PNGs with scripts/fetch-boardgame-assets.sh.
 *
 * Everything is hosted LOCALLY (no remote links at runtime): this script is the
 * one-time producer, the game only ever references /assets/... paths.
 *
 * Usage: node scripts/convert-boardgame-assets.mjs <stageDir>
 *   stageDir contains images/ cards/ skills/ subdirs of raw PNGs.
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = path.join(ROOT, "public", "assets");
const STAGE = process.argv[2] || path.join(ROOT, ".boardgame-asset-stage");

const src = (p) => path.join(STAGE, p);
const out = (p) => path.join(ASSETS, p);

async function ensureDirs() {
  for (const d of ["icons", "board/tokens", "skills", "ui"]) {
    await mkdir(path.join(ASSETS, d), { recursive: true });
  }
}

/** Convert a PNG to webp at its native size (crisp icons/tokens, alpha kept). */
async function icon(from, to, quality = 92) {
  await sharp(src(from)).webp({ quality, effort: 6 }).toFile(out(to));
  return to;
}

/** Convert + rotate (for landscape card backs that must fit the portrait slot). */
async function rotated(from, to, deg, quality = 88) {
  await sharp(src(from)).rotate(deg).webp({ quality, effort: 6 }).toFile(out(to));
  return to;
}

/** Convert a full card scan to the app's canonical unit-card size. */
async function card(from, to, w, h, quality = 86) {
  await sharp(src(from)).resize(w, h, { fit: "fill" }).webp({ quality, effort: 6 }).toFile(out(to));
  return to;
}

await ensureDirs();
const written = [];

// 1) Resource icons (gold / building materials / valuables) -------------------
written.push(await icon("images/gold.png", "icons/resource-gold.webp"));
written.push(await icon("images/valuables.png", "icons/resource-valuables.webp"));

// 2) Combat tokens -------------------------------------------------------------
written.push(await icon("images/attack-token.png", "board/tokens/combat-attack.webp"));
written.push(await icon("images/weakness-token.png", "board/tokens/combat-weakness.webp"));
written.push(await icon("images/corrosion-token.png", "board/tokens/combat-corrosion.webp"));
written.push(await icon("images/paralysis.png", "board/tokens/combat-paralysis.webp"));
written.push(await icon("images/damage-token.png", "board/tokens/combat-damage.webp"));
written.push(await icon("images/defense-token.png", "board/tokens/combat-defense.webp"));

// 3) Stat / board symbols (for later use) -------------------------------------
for (const [from, name] of [
  ["attack", "attack"], ["defense", "defense"], ["hp", "hp"], ["power", "power"],
  ["knowledge", "knowledge"], ["initiative", "initiative"], ["experience", "experience"],
  ["population", "population"], ["morale-positive", "morale-positive"], ["morale-negative", "morale-negative"]
]) {
  written.push(await icon(`images/${from}.png`, `icons/symbol-${name}.webp`));
}

// 4) Air Elemental Few / Pack — real board-game unit cards ---------------------
written.push(await card("cards/unit-air-elemental-few.png", "units-conflux-bronze-air_elementals-few.webp", 743, 1038));
written.push(await card("cards/unit-air-elemental-pack.png", "units-conflux-bronze-air_elementals-pack.webp", 743, 1038));

// 5) Card backs (portrait slot 5/7; landscape scans rotated to fit) -----------
written.push(await icon("cards/mmback.png", "card_back-mm.webp", 90));
written.push(await icon("cards/neutral-back.png", "card_back-neutral.webp", 90));
written.push(await rotated("cards/astrolog-back.png", "card_back-astrologers.webp", 90));
written.push(await rotated("cards/event-back.png", "card_back-events.webp", 90));

// 5b) Empowered STATISTIC cards — distinct "Empowered" faces (Defense,
// Knowledge). The base faces already ship the real art; only the empowered
// variants were reusing the base image. Attack/Power have no printed empowered
// statistic scan in the source, so they keep reusing the base (documented in
// sample.ts). Match the existing 743x1040 statistic-card size.
written.push(await card("cards/empowered_statistic.png", "statistics-defense-empowered.webp", 743, 1040));
written.push(await card("cards/empowered-knowledge.png", "statistics-knowledge-empowered.webp", 743, 1040));

// 6) Secondary-skill emblems used as the main-menu button icons. Only the nine
// icons actually wired to a menu button are shipped (no decorative extras); the
// full skill set lives in the source repo if more are ever needed.
for (const s of [
  "attack", "leadership", "artillery", "pathfinding", "luck",
  "wisdom", "intelligence", "interference", "logistics"
]) {
  written.push(await icon(`skills/${s}.png`, `skills/${s}.webp`));
}

// 7) Spell token (building) — the Spell Book town token. spells.png is the
// real double-sided token (spellbook front = ready, golden mana back = spent).
// The load-bearing town token is TOWN_TOKEN_ICONS.spellBook →
// /assets/token-spellbook.webp, which drives ALL three surfaces (the board
// token well, the town-window header, and the adventure town dock — each
// already dims + marks an X for the spent state, consistent with the build /
// population tokens). Overwriting that one file with the real spellbook FRONT
// face makes the real token appear everywhere with no code change.
await sharp(src("images/spells.png"))
  .extract({ left: 22, top: 50, width: 236, height: 238 })
  .webp({ quality: 92, effort: 6 })
  .toFile(out("token-spellbook.webp"));
written.push("token-spellbook.webp (real spellbook token)");

console.log(`Wrote ${written.length} assets:`);
for (const w of written) console.log("  /assets/" + w);

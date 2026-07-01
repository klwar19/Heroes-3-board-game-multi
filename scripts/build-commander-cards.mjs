#!/usr/bin/env node

/**
 * Build the 12 WOG-style Commander cards.
 *
 * Each commander's HD hand-painted art (scripts/commander-art/<slug>.png,
 * generated with Nano Banana Pro — art only, no frame/text) is composited into
 * the project's golden unit-card frame (public/assets/units-blank-golden.webp)
 * with:
 *   - the commander name in the banner + a "<FACTION> COMMANDER" tag,
 *   - the fixed beginning stat line Attack 2 / Defense 1 / Health 4 / Speed 5
 *     next to the four left-column icons (crossed swords / shield / health /
 *     running-figure=Speed), and
 *   - the two signature abilities in the bottom panel.
 *
 * No number, stat, frame or symbol is baked into the AI art — everything is
 * composited here so the values are trivially editable. The base stats are the
 * user-specified A2/D1/H4/Spd5 for EVERY commander (bonus stats/skills live in
 * the future click-to-open growth panel, not on this static face).
 *
 * Output: public/assets/units-commander-<slug>.webp
 * Run:  node scripts/build-commander-cards.mjs [slug ...]
 */

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = path.join(ROOT, "public", "assets");
const ART = path.join(ROOT, "scripts", "commander-art");
const OUT = path.join(ROOT, "out");

const WEBP = { quality: 82, effort: 6 };

const CARD_WIDTH = 743;
const CARD_HEIGHT = 1040;
// Art window measured from the golden frame's INNER gold border — left edge
// x172, RIGHT edge x680 (not ~705), top y162, and extended DOWN to the ability-
// panel divider (y824). The art fills the old cost-bar row so there is no empty
// band, and stays a couple px inside every border so the frame border (esp. the
// right side) is never covered.
const ART_LEFT = 174;
const ART_TOP = 166;
const ART_WIDTH = 504;   // 174 → 678, just inside the x680 right border
const ART_HEIGHT = 658;  // 166 → 824, down to the bottom-panel divider

// Small leather patch over the cost-bar's left sliver (left of the art, below the
// stat column) so no cost-bar remnant shows. Sampled from clean bottom-panel
// leather. Commanders have no gold recruit cost → no cost bar at all.
const SLIVER = { left: 54, top: 756, width: 124, height: 70 };
const LEATHER_PATCH = { left: 90, top: 856, width: 124, height: 70 };

// Stat numbers are NOT baked here — they are dynamic and rendered by the
// CommanderCard overlay (src/components/commander-card.tsx), which owns the
// well coordinates (x centre 119 → 16%, y baselines 286/456/611/793). The fixed
// beginning line is Attack 2 / Defense 1 / Health 4 / Speed 5 (see
// src/data/commanders.ts, COMMANDER_BASE_STATS).

const COMMANDERS = [
  {
    slug: "paladin", name: "Paladin", faction: "Castle",
    abilities: [
      "Wise: gains 150% of the Hero's experience.",
      "Cure: may cast Cure."
    ]
  },
  {
    slug: "hierophant", name: "Hierophant", faction: "Rampart",
    abilities: [
      "First Aid Master: +1 First Aid Tent per level.",
      "Shield: may cast Shield."
    ]
  },
  {
    slug: "temple_guardian", name: "Temple Guardian", faction: "Tower",
    abilities: [
      "Mana Magician: restores some of the Hero's mana.",
      "Precision: may cast Precision."
    ]
  },
  {
    slug: "succubus", name: "Succubus", faction: "Inferno",
    abilities: [
      "Charming: steals neutral stacks before combat.",
      "Fire Shield: may cast Fire Shield."
    ]
  },
  {
    slug: "brute", name: "Brute", faction: "Dungeon",
    abilities: [
      "Soul Reformer: 50% of battle experience as gold.",
      "Bloodlust: may cast Bloodlust."
    ]
  },
  {
    slug: "soul_eater", name: "Soul Eater", faction: "Necropolis",
    abilities: [
      "Undead: has the properties of an undead creature.",
      "Animate Dead: revives Level 1-5 creatures."
    ]
  },
  {
    slug: "ogre_leader", name: "Ogre Leader", faction: "Stronghold",
    abilities: [
      "Ballista Master: provides additional Ballistas.",
      "Stone Skin: may cast Stone Skin."
    ]
  },
  {
    slug: "shaman", name: "Shaman", faction: "Fortress",
    abilities: [
      "Superior Combat: 150% of the Hero's Attack & Defense.",
      "Haste: may cast Haste (Speed +5)."
    ]
  },
  {
    slug: "astral_spirit", name: "Astral Spirit", faction: "Conflux",
    abilities: [
      "Pacifist: some enemy creatures flee before combat.",
      "Counterstrike: may cast Counterstrike."
    ]
  },
  // Original additions (no WOG source) — abilities provisional, to confirm/wire.
  {
    slug: "corsair", name: "Corsair", faction: "Cove",
    abilities: [
      "Plunder: bonus gold after a won combat.  [provisional]",
      "Fortune: may cast Fortune."
    ]
  },
  {
    slug: "factory", name: "Engineer", faction: "Factory",
    abilities: [
      "Mechanist: provides an additional War Machine.  [provisional]",
      "Precision: may cast Precision."
    ]
  },
  {
    slug: "bulwark", name: "Frost Warlord", faction: "Bulwark",
    abilities: [
      "Frostborn: chills enemies, lowering Speed.  [provisional]",
      "Stone Skin: may cast Stone Skin."
    ]
  }
];

let leatherPatchPromise;
async function leatherPatch() {
  if (!leatherPatchPromise) {
    leatherPatchPromise = sharp(path.join(ASSETS, "units-blank-golden.webp"))
      .resize(CARD_WIDTH, CARD_HEIGHT, { fit: "fill" })
      .extract(LEATHER_PATCH)
      .png()
      .toBuffer();
  }
  return leatherPatchPromise;
}

async function buildCard(card) {
  const frame = await sharp(path.join(ASSETS, "units-blank-golden.webp"))
    .resize(CARD_WIDTH, CARD_HEIGHT, { fit: "fill" })
    .png()
    .toBuffer();

  const patch = await leatherPatch();

  const art = await sharp(path.join(ART, `${card.slug}.png`))
    .resize(ART_WIDTH, ART_HEIGHT, { fit: "cover", position: "top" })
    .png()
    .toBuffer();

  // Only the FRAME + ART are baked. Everything textual — name, faction tag, the
  // (editable) signature abilities, and the DYNAMIC upgradeable stat numbers — is
  // drawn by the CommanderCard React overlay from src/data/commanders.ts, so it
  // can all be changed later without regenerating the image.
  const destination = path.join(ASSETS, `units-commander-${card.slug}.webp`);
  await sharp(frame)
    .composite([
      { input: patch, left: SLIVER.left, top: SLIVER.top },
      { input: art, left: ART_LEFT, top: ART_TOP }
    ])
    .webp(WEBP)
    .toFile(destination);
  return destination;
}

await mkdir(ASSETS, { recursive: true });
await mkdir(OUT, { recursive: true });

const requested = new Set(process.argv.slice(2));
const cards = requested.size > 0
  ? COMMANDERS.filter((c) => requested.has(c.slug))
  : COMMANDERS;

const outputs = [];
for (const card of cards) outputs.push(await buildCard(card));

// Contact sheet
const pw = 248, ph = 347, gap = 8, cols = 4;
const rows = Math.ceil(outputs.length / cols);
const tiles = await Promise.all(outputs.map((o) =>
  sharp(o).resize(pw, ph, { fit: "fill" }).png().toBuffer()));
await sharp({
  create: { width: cols * pw + (cols + 1) * gap, height: rows * ph + (rows + 1) * gap, channels: 4, background: "#15100c" }
})
  .composite(tiles.map((input, i) => ({ input, left: gap + (i % cols) * (pw + gap), top: gap + Math.floor(i / cols) * (ph + gap) })))
  .png()
  .toFile(path.join(OUT, "commander-cards-contact-sheet.png"));

for (const o of outputs) console.log(path.relative(ROOT, o));
console.log("contact sheet: out/commander-cards-contact-sheet.png");

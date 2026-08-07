#!/usr/bin/env node
/**
 * Polish Set Artifacts art pipeline.
 *
 *   node scripts/build-set-artifact-art.mjs [--src <folder>]
 *
 * Turns the mod author's raw PNG drop into the two committed webp families:
 *
 *   public/assets/set-artifacts/cards/<setId>.webp   743×1040  (the repo's
 *       artifact card-face size; the source scans are a slightly taller 2:3, so
 *       they are letterboxed with `fit: contain` on TRANSPARENT — never cropped,
 *       because the lower third of every card is the per-tier rules text)
 *   public/assets/set-artifacts/icons/<setId>.webp   256×256   (the corner badge
 *       worn by every member Artifact card; the icon IS the card's own artwork)
 *
 * The masters are 2–3.5MB PNGs and are deliberately NOT committed; they live in
 * the author's asset drop. `SOURCES` below records exactly which raw file became
 * which set, including the two filenames that do not name their set:
 *   - `icons/Obraz4.png`  — Titan's Thunder (the lightning sword; an Office
 *     auto-export name, NOT a generic set badge).
 *   - `icons/miasto-dobrobytu.png` ("city of prosperity") — Cornucopia, NOT
 *     Golden Goose: it is the gem-filled horn painted on the Cornucopia card.
 *   - `cards/Pedant of Reflection.png` — the author's typo for Pendant of
 *     Reflection (the card's own printed title reads "Pendant").
 * Every one of the eleven icon→set matches is PROVABLE rather than guessed: each
 * icon is pixel-for-pixel the artwork inside its set card's art window.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_CARDS = path.join(ROOT, "public/assets/set-artifacts/cards");
const OUT_ICONS = path.join(ROOT, "public/assets/set-artifacts/icons");

/** The repo's artifact card-face size (see public/assets/artifacts_*-*.webp). */
const CARD_W = 743;
const CARD_H = 1040;
const ICON_SIZE = 256;

/** setId → [raw card filename, raw icon filename] inside the author's drop. */
const SOURCES = {
  angelic_alliance: ["Angelic Alliance.png", "c68baf32-6736-4c74-951d-5ef68cc3e96c.png"],
  power_of_the_dragon_father: ["Power of the Dragon Father.png", "moc-ojca-smokow.png"],
  titans_thunder: ["Titan's Thunder.png", "Obraz4.png"],
  ironfist_of_the_ogre: ["Ironfist of the Ogre.png", "fbbb7b88-e9b7-419a-bebd-014d45b860be.png"],
  armor_of_the_damned: ["Armor of the Damned.png", "zbroja-przekletego.png"],
  pendant_of_reflection: ["Pedant of Reflection.png", "a38706a8-a2a6-4932-9347-66ddaa260294.png"],
  wizards_well: ["Wizard's Well.png", "zrodlo-maga.png"],
  diplomats_cloak: ["Diplomat's Cloak.png", "bec98c19-4586-497c-92ad-0875bea9e199.png"],
  cornucopia: ["Cornucopia.png", "miasto-dobrobytu.png"],
  statue_of_legion: ["Statue of Legion.png", "statua-legionow.png"],
  golden_goose: ["Golden Goose.png", "b8141283-aec5-4ebf-9fb1-1e0028362197.png"]
};

function srcRoot() {
  const flag = process.argv.indexOf("--src");
  if (flag >= 0 && process.argv[flag + 1]) return process.argv[flag + 1];
  return process.env.SET_ARTIFACT_SRC || "";
}

async function main() {
  const src = srcRoot();
  if (!src || !existsSync(src)) {
    console.error(
      "Raw master folder not found. Pass it explicitly:\n" +
        "  node scripts/build-set-artifact-art.mjs --src <folder with cards/ and icons/>\n" +
        "(The multi-MB PNG masters are deliberately not committed.)"
    );
    process.exit(1);
  }
  await mkdir(OUT_CARDS, { recursive: true });
  await mkdir(OUT_ICONS, { recursive: true });

  for (const [setId, [cardFile, iconFile]] of Object.entries(SOURCES)) {
    const cardIn = path.join(src, "cards", cardFile);
    const iconIn = path.join(src, "icons", iconFile);
    for (const file of [cardIn, iconIn]) {
      if (!existsSync(file)) throw new Error(`missing master: ${file}`);
    }

    // Card: contain (never crop — the rules text lives at the bottom), q85, the
    // text-bearing card-face quality every other card family uses.
    const card = await sharp(await readFile(cardIn))
      .resize(CARD_W, CARD_H, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 85, effort: 6, smartSubsample: true })
      .toBuffer();
    await writeFile(path.join(OUT_CARDS, `${setId}.webp`), card);

    // Icon: square badge, contain so nothing is clipped.
    const icon = await sharp(await readFile(iconIn))
      .resize(ICON_SIZE, ICON_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 88, effort: 6 })
      .toBuffer();
    await writeFile(path.join(OUT_ICONS, `${setId}.webp`), icon);

    console.log(
      `${setId.padEnd(28)} card ${(card.length / 1024).toFixed(0)}KB  icon ${(icon.length / 1024).toFixed(0)}KB`
    );
  }
  console.log(`\n${Object.keys(SOURCES).length} sets — 22 files written.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Heroes 3 Board Game Community Balance Change — card-face art pipeline.
 *
 *   node scripts/build-community-balance-art.mjs [--src <folder>]
 *
 * Turns the community sheet's raw webp masters (~2090×2900, named exactly as the
 * sheet's "WebP Link" column, e.g. `abilities-artillery.webp`,
 * `abilities-artillery-empowered.webp`, `spells-haste.webp`) into the committed
 * card faces:
 *
 *   public/assets/community-balance/<card id with "." → "-">.webp   743×1040
 *
 * 743×1040 is the repo's card-face size and matches the Polish Balance Pack
 * faces exactly (`public/assets/polish-balance/*.webp`), which is what
 * `src/data/cards/community-balance-art.test.ts` asserts. `fit: contain` on
 * transparent — NEVER crop: the lower half of every card is its rules text.
 * Quality 85 is the repo's text-bearing card-face band (see
 * `scripts/compress-media.mjs` `webpQualityFor`), and the test also refuses any
 * output under 40KB as a stub.
 *
 * THE `SOURCES` TABLE IS THE CONTRACT (mirroring
 * `scripts/build-set-artifact-art.mjs`): master filename → card id. It is EMPTY
 * in this scaffolding step. A later content step adds a row ONLY for a card
 * whose new printed text is genuinely engine-wired, together with its id in
 * `COMMUNITY_BALANCE_CARD_IDS` — shipping a face for an unwired reprint would
 * print rules the engine never runs.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public/assets/community-balance");

/** The repo's card-face size (identical to the Polish Balance Pack faces). */
const CARD_W = 743;
const CARD_H = 1040;

/** Where the sheet's downloaded masters live when `--src` is not passed. */
const DEFAULT_SRC = path.join(
  "C:",
  "Users",
  "klwar",
  "AppData",
  "Local",
  "Temp",
  "claude",
  "E--heroes-3-BG-multi",
  "e40d2276-c47c-4d72-89a2-8e62e97c760c",
  "scratchpad",
  "community-art"
);

/**
 * master filename (inside the source folder) → card id.
 *
 * An id ending in `.empowered` is not used here: a DEDICATED empowered face is
 * written as `<id with dots→dashes>-empowered.webp`, so give it the pseudo-id
 * `"<cardId>#empowered"` and this script emits that basename.
 *
 * The ABILITIES family is COMPLETE (all 12 of the sheet's ability cards); the
 * remaining families add their rows in later steps.
 */
const SOURCES = {
  // ---- Abilities (all twelve) ----------------------------------------------
  "abilities-artillery.webp": "ability.artillery",
  "abilities-artillery-empowered.webp": "ability.artillery#empowered",
  "abilities-ballistics.webp": "ability.ballistics",
  "abilities-ballistics-empowered.webp": "ability.ballistics#empowered",
  "abilities-estates.webp": "ability.estates",
  "abilities-estates-empowered.webp": "ability.estates#empowered",
  "abilities-first_aid.webp": "ability.first_aid",
  "abilities-first_aid-empowered.webp": "ability.first_aid#empowered",
  "abilities-intelligence.webp": "ability.intelligence",
  "abilities-intelligence-empowered.webp": "ability.intelligence#empowered",
  "abilities-leadership.webp": "ability.leadership",
  "abilities-leadership-empowered.webp": "ability.leadership#empowered",
  "abilities-luck.webp": "ability.luck",
  "abilities-luck-empowered.webp": "ability.luck#empowered",
  // Mysticism has no Expert side, so the sheet ships no Empowered printing.
  "abilities-mysticism.webp": "ability.mysticism",
  "abilities-necromancy.webp": "ability.necromancy",
  "abilities-necromancy-empowered.webp": "ability.necromancy#empowered",
  "abilities-scouting.webp": "ability.scouting",
  "abilities-scouting-empowered.webp": "ability.scouting#empowered",
  "abilities-tactics.webp": "ability.tactics",
  "abilities-tactics-empowered.webp": "ability.tactics#empowered",
  "abilities-wisdom.webp": "ability.wisdom",
  "abilities-wisdom-empowered.webp": "ability.wisdom#empowered",

  // ---- Spells (all twenty-six) ---------------------------------------------
  // A spell has no distinct Empowered printing (Empowered is an ABILITY-card
  // display state), so each spell contributes exactly one face.
  "spells-haste.webp": "spell.haste",
  "spells-fortune.webp": "spell.fortune",
  "spells-precision.webp": "spell.precision",
  "spells-view_air.webp": "spell.view_air",
  "spells-counterstrike.webp": "spell.counterstrike",
  "spells-chain_lightning.webp": "spell.chain_lightning",
  "spells-slow.webp": "spell.slow",
  "spells-shield.webp": "spell.shield",
  "spells-stone_skin.webp": "spell.stone_skin",
  "spells-anti_magic.webp": "spell.anti_magic",
  "spells-town_portal.webp": "spell.town_portal",
  "spells-visions.webp": "spell.visions",
  "spells-fire_wall.webp": "spell.fire_wall",
  "spells-misfortune.webp": "spell.misfortune",
  "spells-bloodlust.webp": "spell.bloodlust",
  "spells-curse.webp": "spell.curse",
  "spells-inferno.webp": "spell.inferno",
  "spells-slayer.webp": "spell.slayer",
  "spells-frenzy.webp": "spell.frenzy",
  "spells-forgetfulness.webp": "spell.forgetfulness",
  "spells-bless.webp": "spell.bless",
  "spells-weakness.webp": "spell.weakness",
  "spells-dispel.webp": "spell.dispel",
  "spells-cure.webp": "spell.cure",
  "spells-mirth.webp": "spell.mirth",
  "spells-prayer.webp": "spell.prayer",

  // ---- Artifacts (all thirty-four) -----------------------------------------
  // An artifact has no Empowered printing, so each contributes exactly one face.
  // NOTE two misspellings in the sheet's own filenames, mapped to the real ids:
  //   artifacts_minor-inexhaustiable_cart_of_lumber.webp -> inexhaustible_cart_of_lumber
  //   artifacts_minor-lions_of_legion.webp               -> loins_of_legion
  "artifacts_relic-boots_of_polarity.webp": "artifact.boots_of_polarity",
  "artifacts_relic-celestial_necklace_of_bliss.webp": "artifact.celestial_necklace_of_bliss",
  "artifacts_relic-crown_of_dragontooth.webp": "artifact.crown_of_dragontooth",
  "artifacts_relic-endless_sack_of_gold.webp": "artifact.endless_sack_of_gold",
  "artifacts_relic-lions_shield_of_courage.webp": "artifact.lions_shield_of_courage",
  "artifacts_relic-sword_of_judgement.webp": "artifact.sword_of_judgement",
  "artifacts_relic-sandals_of_the_saint.webp": "artifact.sandals_of_the_saint",
  "artifacts_major-ambassadors_sash.webp": "artifact.ambassadors_sash",
  "artifacts_major-arms_of_legion.webp": "artifact.arms_of_legion",
  "artifacts_major-cards_of_prophecy.webp": "artifact.cards_of_prophecy",
  "artifacts_major-endless_bag_of_gold.webp": "artifact.endless_bag_of_gold",
  "artifacts_major-endless_purse_of_gold.webp": "artifact.endless_purse_of_gold",
  "artifacts_major-everflowing_crystal_cloak.webp": "artifact.everflowing_crystal_cloak",
  "artifacts_major-everpouring_vial_of_mercury.webp": "artifact.everpouring_vial_of_mercury",
  "artifacts_major-eversmoking_ring_of_sulfur.webp": "artifact.eversmoking_ring_of_sulfur",
  "artifacts_major-golden_bow.webp": "artifact.golden_bow",
  "artifacts_major-head_of_legion.webp": "artifact.head_of_legion",
  "artifacts_major-ogres_club_of_havoc.webp": "artifact.ogres_club_of_havoc",
  "artifacts_major-pendant_of_second_sight.webp": "artifact.pendant_of_second_sight",
  "artifacts_major-surcoat_of_counterpoise.webp": "artifact.surcoat_of_counterpoise",
  "artifacts_major-targ_of_the_rampaging_ogre.webp": "artifact.targ_of_the_rampaging_ogre",
  "artifacts_major-tunic_of_the_cyclops_king.webp": "artifact.tunic_of_the_cyclops_king",
  "artifacts_minor-breastplate_of_petrified_wood.webp": "artifact.breastplate_of_petrified_wood",
  "artifacts_minor-centaurs_axe.webp": "artifact.centaurs_axe",
  "artifacts_minor-dragon_wing_tabard.webp": "artifact.dragon_wing_tabard",
  "artifacts_minor-hourglass_of_the_evil_hour.webp": "artifact.hourglass_of_the_evil_hour",
  "artifacts_minor-inexhaustiable_cart_of_lumber.webp": "artifact.inexhaustible_cart_of_lumber",
  "artifacts_minor-inexhaustible_cart_of_ore.webp": "artifact.inexhaustible_cart_of_ore",
  "artifacts_minor-legs_of_legion.webp": "artifact.legs_of_legion",
  "artifacts_minor-lions_of_legion.webp": "artifact.loins_of_legion",
  "artifacts_minor-scales_of_the_greater_basilisk.webp": "artifact.scales_of_the_greater_basilisk",
  "artifacts_minor-speculum.webp": "artifact.speculum",
  "artifacts_minor-spirit_of_oppression.webp": "artifact.spirit_of_oppression",
  "artifacts_minor-torso_of_legion.webp": "artifact.torso_of_legion"
};

/** The committed basename for a table entry's target id. */
function outBasename(cardId) {
  const [id, variant] = cardId.split("#");
  return `${id.replaceAll(".", "-")}${variant === "empowered" ? "-empowered" : ""}`;
}

function srcRoot() {
  const flag = process.argv.indexOf("--src");
  if (flag >= 0 && process.argv[flag + 1]) return process.argv[flag + 1];
  return process.env.COMMUNITY_BALANCE_SRC || DEFAULT_SRC;
}

async function main() {
  const entries = Object.entries(SOURCES);
  if (entries.length === 0) {
    console.log(
      "No sources declared yet — the Community Balance Change art table is empty.\n" +
        "Add `master filename -> card id` rows to SOURCES as each reprint is wired."
    );
    return;
  }
  const src = srcRoot();
  if (!src || !existsSync(src)) {
    console.error(
      "Raw master folder not found. Pass it explicitly:\n" +
        "  node scripts/build-community-balance-art.mjs --src <folder of sheet webp masters>\n" +
        "(The multi-MB masters are deliberately not committed.)"
    );
    process.exit(1);
  }
  await mkdir(OUT_DIR, { recursive: true });

  for (const [file, cardId] of entries) {
    const input = path.join(src, file);
    if (!existsSync(input)) throw new Error(`missing master: ${input}`);
    const source = await readFile(input);
    const encodeAt = (quality) =>
      sharp(source)
        .resize(CARD_W, CARD_H, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality, effort: 6, smartSubsample: true })
        .toBuffer();
    let face = await encodeAt(85);
    // The face test refuses anything under 40KB as a stub. A few of the SPELL
    // masters are flat enough that q85 lands just under it, so re-encode those
    // at a higher quality rather than weakening the shared stub gate.
    if (face.length < 45 * 1024) {
      face = await encodeAt(95);
    }
    const name = `${outBasename(cardId)}.webp`;
    await writeFile(path.join(OUT_DIR, name), face);
    const kb = face.length / 1024;
    console.log(`${name.padEnd(46)} ${kb.toFixed(0)}KB${kb < 40 ? "   <-- UNDER 40KB, the test will reject it" : ""}`);
  }
  console.log(`\n${entries.length} community-balance card faces written.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

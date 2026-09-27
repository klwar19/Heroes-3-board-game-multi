#!/usr/bin/env node
/**
 * Hex Battlefield HERO figures for towns without a PC hero sprite (Blue
 * Archive...), rotoscoped from a real H3 / HotA hero battle sprite exactly as
 * the creatures are (scripts/build-pose-guide.mjs -> Codex repaint ->
 * scripts/import-pose-guided-sheet.mjs): the rider keeps the donor's mount,
 * lance, motion, frame geometry and PC placement; only the rider's look is
 * repainted as the hero.
 *
 * Hero battle groups (CHxx.def: 0 standing, 1 shuffle, 2 defeat, 3 victory,
 * 4 cast) travel through the creature pipeline under creature ids with the
 * same meaning (2 standing, 1 mouse-over fidget, 5 death, 12 strike, 18 cast)
 * and are renamed back on install:
 *
 *   node scripts/build-hero-pose-sprites.mjs guide <slug> <donor-hero-slug>
 *     -> tmp/gen/pose-sheets/<slug>.guide.png/.json (+ hero-donors.json)
 *   node scripts/build-hero-pose-sprites.mjs install <slug> <donor-hero-slug>
 *     -> public/assets/battle-hex/heroes/<slug>.webp + its hero-sprite-atlases.json entry
 *
 * The repainted sheet must be tmp/gen/pose-sheets/<slug>.png. The installed
 * atlas keeps the donor's standing height (scale 1) and its VCMI placement
 * origin, so the figure and its player flag stand where the PC draws a hero.
 * Output webps are media-managed: run `npm run media:publish` before deploying.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
sharp.cache(false);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHEETS = path.join(ROOT, "tmp", "gen", "pose-sheets");
const HERO_META = path.join(ROOT, "src", "data", "battle-hex", "hero-sprite-atlases.json");
const HERO_DIR = path.join(ROOT, "public", "assets", "battle-hex", "heroes");
const DONOR_META = path.join(SHEETS, "hero-donors.json");
const WORK = path.join(ROOT, "tmp", "gen", "hero-pose-out");
/** Hero group -> the creature group of the same meaning (and back on install). */
const TO_CREATURE = { 0: 2, 1: 1, 2: 5, 3: 12, 4: 18 };
const TO_HERO = Object.fromEntries(Object.entries(TO_CREATURE).map(([hero, creature]) => [creature, Number(hero)]));

const [mode, slug, donor] = process.argv.slice(2);
if (!["guide", "install"].includes(mode) || !slug || !donor) {
  console.error("usage: node scripts/build-hero-pose-sprites.mjs guide|install <slug> <donor-hero-slug>");
  process.exit(1);
}
const heroAtlases = JSON.parse(fs.readFileSync(HERO_META, "utf8"));
const donorAtlas = heroAtlases[donor];
if (!donorAtlas || donorAtlas.originX === undefined) throw new Error(`${donor} is not a PC hero atlas`);

/** Opaque (alpha > 200) body height of an atlas's standing frame (group `group`), in pixels. */
async function standingHeight(atlas, group = "0", image = path.join(ROOT, "public", atlas.image)) {
  const info = atlas.groups[group];
  const { data } = await sharp(image)
    .extract({ left: 0, top: info.row * atlas.frameHeight, width: atlas.frameWidth, height: atlas.frameHeight })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let first = -1;
  let last = -1;
  for (let y = 0; y < atlas.frameHeight; y += 1) {
    for (let x = 0; x < atlas.frameWidth; x += 1) {
      if (data[(y * atlas.frameWidth + x) * 4 + 3] > 200) {
        if (first < 0) first = y;
        last = y;
        break;
      }
    }
  }
  if (first < 0) throw new Error(`${image}: empty standing frame`);
  return last - first + 1;
}

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: ROOT, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (mode === "guide") {
  // The donor under creature group ids, in a side table the guide builder reads (--meta).
  const table = fs.existsSync(DONOR_META) ? JSON.parse(fs.readFileSync(DONOR_META, "utf8")) : {};
  const groups = {};
  for (const [hero, info] of Object.entries(donorAtlas.groups)) {
    if (TO_CREATURE[hero] !== undefined) groups[TO_CREATURE[hero]] = info;
  }
  const { originX, originY, ...rest } = donorAtlas;
  table[donor] = { ...rest, groups };
  fs.mkdirSync(SHEETS, { recursive: true });
  fs.writeFileSync(DONOR_META, JSON.stringify(table, null, 1) + "\n");
  const caps = Object.entries(groups).map(([group, info]) => `${group}:${info.frames}`).join(",");
  run([
    path.join(ROOT, "scripts", "build-pose-guide.mjs"), donor, path.join(SHEETS, `${slug}.guide`),
    "--meta", path.relative(ROOT, DONOR_META), "--groups", "2,1,18,12,5", "--caps", caps, "--grid", "auto", "--max-scale", "2.4"
  ]);
  process.exit(0);
}

// install
const sheet = path.join(SHEETS, `${slug}.png`);
if (!fs.existsSync(sheet)) throw new Error(`missing ${path.relative(ROOT, sheet)}`);
fs.mkdirSync(WORK, { recursive: true });
const workMeta = path.join(WORK, "atlases.json");
if (!fs.existsSync(workMeta)) fs.writeFileSync(workMeta, "{}\n");
const height = await standingHeight(donorAtlas);
run([
  path.join(ROOT, "scripts", "import-pose-guided-sheet.mjs"), sheet, path.join(SHEETS, `${slug}.guide.json`), slug,
  "--height", String(height), "--idle", "sheet", "--groups", "1,2,5,12,18",
  "--out-dir", WORK, "--meta", workMeta
]);
const built = JSON.parse(fs.readFileSync(workMeta, "utf8"))[slug];
if (!built) throw new Error(`import wrote no ${slug}`);
const groups = {};
for (const [creature, info] of Object.entries(built.groups)) {
  if (TO_HERO[creature] !== undefined) groups[TO_HERO[creature]] = info;
}
for (const hero of Object.keys(TO_CREATURE)) {
  if (!groups[hero]) throw new Error(`${slug}: hero group ${hero} missing after import`);
}
// The placement origin keeps its offset from the feet, at the repaint's scale.
const scale = (await standingHeight(built, "2", path.join(WORK, `${slug}.webp`))) / height;
const entry = {
  image: `/assets/battle-hex/heroes/${slug}.webp`,
  frameWidth: built.frameWidth,
  frameHeight: built.frameHeight,
  columns: built.columns,
  anchorX: built.anchorX,
  anchorY: built.anchorY,
  originX: Math.round(built.anchorX - (donorAtlas.anchorX - donorAtlas.originX) * scale),
  originY: Math.round(built.anchorY - (donorAtlas.anchorY - donorAtlas.originY) * scale),
  groups
};
fs.copyFileSync(path.join(WORK, `${slug}.webp`), path.join(HERO_DIR, `${slug}.webp`));
heroAtlases[slug] = entry;
fs.writeFileSync(HERO_META, JSON.stringify(heroAtlases, null, 2) + "\n");
console.log(`installed ${slug}: ${entry.frameWidth}x${entry.frameHeight} anchor ${entry.anchorX},${entry.anchorY} origin ${entry.originX},${entry.originY} groups ${Object.entries(groups).map(([g, i]) => `${g}:${i.frames}`).join(" ")}`);

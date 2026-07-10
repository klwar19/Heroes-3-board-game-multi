// One-shot: optimize the codex-generated living-dragon chrome (claw grips,
// tail coils, wrapping vine — painted around green-screen bars/columns so the
// keyed PNGs carry real wrap occlusion) into public/assets/ui/ornate/.
// Usage: node scripts/place-ornate-dragon.mjs <dir with *-keyed.png>
import sharp from "sharp";
import path from "node:path";
import fs from "node:fs";

const src = process.argv[2]; // dir with the chroma-keyed source PNGs
const out = path.resolve("public/assets/ui/ornate"); // run from the repo root
fs.mkdirSync(out, { recursive: true });

const jobs = [
  // The Azure Dragon foreclaw clutching the map card bar's top edge (pose
  // from the user's reference; painted around a green-screen bar whose top
  // edge sits at 67.4% of the keyed height — knuckle arch above, hooked
  // talons wrapping down in front below).
  { in: "clutch-b-keyed.png", out: "azure-claw.webp", width: 820 }
];

for (const j of jobs) {
  const file = path.join(out, j.out);
  const source = path.join(src, j.in);
  if (!fs.existsSync(source)) {
    console.log(`SKIP ${j.out} (no ${j.in})`);
    continue;
  }
  let img = sharp(source).resize({ width: j.width, withoutEnlargement: true });
  if (j.flop) img = img.flop();
  await img.webp({ quality: 88 }).toFile(file);
  const kb = Math.round(fs.statSync(file).size / 1024);
  console.log(`OK ${j.out} (${kb} kb)`);
}

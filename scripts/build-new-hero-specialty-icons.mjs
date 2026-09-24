// Specialty-card icons for the v171 heroes whose specialty names a unit or war
// machine: a square crop of JUST the picture from the real card's art window
// (same format as icon-dace-minotaur.webp: 512x512, opaque), never the whole card.
import sharp from "sharp";

const ICONS = [
  { out: "icon-korbac-dragon_flies", card: "units-fortress-bronze-dragon_flies-few", left: 232, top: 210, size: 436 },
  { out: "icon-verdish-first_aid_tent", card: "war_machines-first_aid_tent", left: 110, top: 180, size: 500 },
  { out: "icon-piquedram-gargoyles", card: "units-tower-bronze-gargoyles-few", left: 232, top: 210, size: 450 },
  { out: "icon-urftin-dwarves", card: "units-rampart-bronze-dwarves-few", left: 244, top: 205, size: 440 },
];

for (const icon of ICONS) {
  await sharp(`public/assets/${icon.card}.webp`)
    .extract({ left: icon.left, top: icon.top, width: icon.size, height: icon.size })
    .flatten({ background: "#000000" })
    .resize(512, 512, { kernel: "lanczos3" })
    .webp({ quality: 85, effort: 6 })
    .toFile(`public/assets/specialty-card/${icon.out}.webp`);
  console.log(`wrote public/assets/specialty-card/${icon.out}.webp`);
}

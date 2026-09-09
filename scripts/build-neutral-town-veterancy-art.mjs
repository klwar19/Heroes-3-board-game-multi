import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.join(process.env.USERPROFILE, ".codex/generated_images/01a084da-67ba-7101-a643-f3a04c29f1f3");
const atlases = {
  castle: ["exec-bd660f95-49ad-4e6a-a880-7f206f572b64.png", ["set-the-spear","marked-volley","winged-riposte","righteous-pursuit","consecrated-shot","full-gallop","guardian-angel"]],
  rampart: ["exec-cdbef23f-b163-4f15-8fc1-d391b6dd8018.png", ["skirmisher-step","runic-backlash","first-volley","mana-turbulence","deep-roots","moonlit-aid"]],
  tower: ["exec-84d8f128-30e3-4166-a0e5-70d79e33da09.png", ["improvised-ammunition","stone-landing","arcane-plating","spell-channel","unstable-wish","measured-blades"]],
  inferno: ["exec-9e3a713e-02d1-4a5d-99a5-ef1a0b3c1772.png", ["stolen-spark","scattering-flame","threefold-threat","hellish-endurance","summoned-torment","searing-passage","infernal-command"]],
  necropolis: ["exec-c138d642-c62e-4a3f-bf92-b3ea097228ef.png", ["bone-wall","putrid-grasp","ethereal-escape","blood-tribute","death-cloud","dread-charge","ageing-breath"]],
  dungeon: ["exec-c37fef7f-48d4-4d19-b6d2-11199d07d348.png", ["blind-instinct","strike-and-return","disrupting-gaze","petrifying-aim","labyrinth-cleave","barbed-revenge","predators-mark"]],
  stronghold: ["exec-017bd10f-65b7-4912-b019-df49b7690a26.png", ["cowards-luck","pack-rush","suppressing-shot","bodyguard","chain-lightning","boulder-crash","crushing-claws"]],
  fortress: ["exec-c1e340e0-85b8-4bdf-a0c3-a674b0cbf90a.png", ["marsh-scavenger","venom-arrow","disorienting-landing","heavy-gaze","armoured-prey","potent-venom"]],
  cove: ["exec-249abb9b-34c2-450b-af91-6ea83e678218.png", ["flowing-assault","boarding-formation","return-fire","raking-dive","bewitching-bolt","scaled-intercept","toxic-counter"]],
  factory: ["exec-19b1c682-bc03-4931-854a-c1032230c33b.png", ["lucky-ricochet"]],
};
const out = "public/game-tokens/rank-ability/neutral-town";
fs.mkdirSync(out, { recursive: true });
for (const [faction, [file, slugs]] of Object.entries(atlases)) {
  const input = path.join(root, file);
  const { width, height } = await sharp(input).metadata();
  if (!width || !height) throw new Error(`Unreadable atlas: ${input}`);
  for (let index = 0; index < slugs.length; index++) {
    const left = Math.floor(index * width / slugs.length);
    const right = Math.floor((index + 1) * width / slugs.length);
    const cellWidth = right - left;
    const size = Math.min(cellWidth, height);
    const top = Math.floor((height - size) / 2);
    await sharp(input).extract({ left, top, width: size, height: size }).resize(256, 256).webp({ quality: 90 }).toFile(path.join(out, `${faction}-${slugs[index]}.webp`));
  }
}
console.log("Prepared 61 neutral-town veterancy icons.");

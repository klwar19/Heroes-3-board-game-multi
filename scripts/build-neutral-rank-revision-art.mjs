import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

// Production asset preparation only: no gameplay or test runners.
const sourceRoot = path.join(
  process.env.USERPROFILE,
  ".codex/generated_images/01a084d7-6567-7a90-9bb2-9fe6b27ba768",
);
const icons = {
  "air-chain-lightning": "exec-5b9bdd3d-1b99-45a6-baf8-37d3a6246a0e.png",
  "fire-damage-cap": "exec-ac4f942d-5638-4eca-88b8-efa64c42a986.png",
  "ranged-fire-shield": "exec-34794f92-f355-4a70-b53f-ea00e73775e2.png",
  "water-spell-power": "exec-fa98a641-49b2-40ad-ba6e-f719cdfdc3da.png",
  "earth-spell-power": "exec-5f487c09-f677-44d3-a079-8c132256a4b5.png",
  "hell-steed-last-stand": "exec-40b0a7c5-95db-4297-a14b-3980f58a0d26.png",
  "nightmare-death-stare-reroll": "exec-8ae0c7e4-974b-4917-9429-4b8479a92987.png",
  "arctic-harden": "exec-d18076e3-639a-45a2-b69b-36501b1e8e9c.png",
  "arctic-slow-shot": "exec-e74ed315-c1f7-4334-872a-75ba62eebcd4.png",
  "lava-ongoing-immunity": "exec-eeae1d39-d40a-4747-845c-e124eccfcf5d.png",
  "lava-burst": "exec-e61b3656-8afd-4b31-ac55-48e230354807.png",
  "lava-burn": "exec-dff3017a-d377-4d7d-b413-0e510f5b87a2.png",
  "werewolf-astral-hunt": "exec-ec0b4037-3019-4bc4-943a-58467a37c40b.png",
  "werewolf-pack-call": "exec-f14bbf12-b17d-482f-acc2-952079851f73.png",
};

const destination = "public/game-tokens/rank-ability/neutral-revisions";
await fs.mkdir(destination, { recursive: true });
const circularMask = Buffer.from(
  '<svg width="256" height="256"><circle cx="128" cy="128" r="127" fill="white"/></svg>',
);
for (const [name, filename] of Object.entries(icons)) {
  const source = path.join(sourceRoot, filename);
  await sharp(source)
    .resize(256, 256, { fit: "cover" })
    .ensureAlpha()
    .composite([{ input: circularMask, blend: "dest-in" }])
    .webp({ quality: 88, alphaQuality: 100 })
    .toFile(path.join(destination, `${name}.webp`));
}
console.log(`Prepared ${Object.keys(icons).length} neutral rank revision icons.`);

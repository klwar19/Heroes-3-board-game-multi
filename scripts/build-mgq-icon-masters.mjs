import path from "node:path";
import process from "node:process";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const root = process.cwd();
const rawRoot = path.join(root, "scripts", "anime-art", "raw", "mgq");
const iconRoot = path.join(rawRoot, "icons");
await mkdir(iconRoot, { recursive: true });

const atlasGroups = [
  {
    atlas: "grades.png",
    outputs: ["grade-apprentice", "grade-journeyman", "grade-advanced-job", "grade-awakened"],
  },
  {
    atlas: "jobs.png",
    outputs: ["rank-job-warrior", "rank-job-guard", "rank-job-mage", "rank-job-healer"],
  },
  {
    atlas: "mechanics.png",
    outputs: [
      "mechanic-companion-seal",
      "mechanic-job-reassign",
      "mechanic-spirit-contract",
      "token-temptation",
    ],
  },
];

for (const group of atlasGroups) {
  const atlasPath = path.join(iconRoot, "atlases", group.atlas);
  const metadata = await sharp(atlasPath).metadata();
  const halfWidth = Math.floor((metadata.width ?? 1536) / 2);
  const halfHeight = Math.floor((metadata.height ?? 1536) / 2);
  const positions = [
    { left: 0, top: 0 },
    { left: halfWidth, top: 0 },
    { left: 0, top: halfHeight },
    { left: halfWidth, top: halfHeight },
  ];
  for (let index = 0; index < group.outputs.length; index += 1) {
    const position = positions[index];
    const outputPath = path.join(iconRoot, `${group.outputs[index]}-master.png`);
    await sharp(atlasPath)
      .extract({ ...position, width: halfWidth, height: halfHeight })
      .resize(512, 512, { fit: "cover" })
      .png()
      .toFile(outputPath);
    console.log(path.relative(root, outputPath));
  }
}

const specialtyHeroes = ["luka", "alice", "ilias", "granberia", "promestein"];
for (const hero of specialtyHeroes) {
  const inputPath = path.join(rawRoot, "heroes", `${hero}-master.png`);
  const outputPath = path.join(iconRoot, `specialty-${hero}-master.png`);
  await sharp(inputPath)
    .resize(512, 512, { fit: "cover", position: "top" })
    .png()
    .toFile(outputPath);
  console.log(path.relative(root, outputPath));
}

const spiritBackground = {
  create: { width: 512, height: 512, channels: 4, background: { r: 7, g: 17, b: 39, alpha: 1 } },
};
for (const spirit of ["sylph", "gnome", "undine", "salamander"]) {
  const sourcePath = path.join(root, "scripts", "anime-art", "refs", "mgq", `${spirit}.png`);
  const sprite = await sharp(sourcePath)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize(440, 440, { fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer({ resolveWithObject: true });
  const outputPath = path.join(iconRoot, `spirit-${spirit}-master.png`);
  await sharp(spiritBackground)
    .composite([
      {
        input: sprite.data,
        left: Math.round((512 - sprite.info.width) / 2),
        top: Math.round((512 - sprite.info.height) / 2),
      },
    ])
    .png()
    .toFile(outputPath);
  console.log(path.relative(root, outputPath));
}

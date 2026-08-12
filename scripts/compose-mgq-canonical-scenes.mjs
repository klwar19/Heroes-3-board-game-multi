import path from "node:path";
import process from "node:process";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const root = process.cwd();
const entries = [
  { slug: "regina", maxWidth: 940, maxHeight: 1280, yBias: 70 },
  { slug: "aria", maxWidth: 930, maxHeight: 1320, yBias: 30 },
  { slug: "lisa", maxWidth: 900, maxHeight: 1300, yBias: 40 },
  { slug: "ooma", maxWidth: 980, maxHeight: 1320, yBias: 30 },
  {
    slug: "ilias",
    sourceSlug: "ilias-sealed",
    backgroundSlug: "ilias-sealed",
    maxWidth: 860,
    maxHeight: 1320,
    yBias: 40,
    outputKind: "hero",
  },
];

for (const entry of entries) {
  const sourcePath = path.join(
    root,
    "scripts",
    "anime-art",
    "refs",
    "mgq",
    `${entry.sourceSlug ?? entry.slug}.png`,
  );
  const backgroundPath = path.join(
    root,
    "scripts",
    "anime-art",
    "raw",
    "mgq",
    "backgrounds",
    `${entry.backgroundSlug ?? entry.slug}-scene.png`,
  );

  const sprite = await sharp(sourcePath)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize({
      width: entry.maxWidth,
      height: entry.maxHeight,
      fit: "inside",
      kernel: sharp.kernel.lanczos3,
      withoutEnlargement: false,
    })
    .png()
    .toBuffer({ resolveWithObject: true });

  const left = Math.round((1024 - sprite.info.width) / 2);
  const top = Math.max(20, 1536 - sprite.info.height - entry.yBias);
  const composed = await sharp(backgroundPath)
    .resize(1024, 1536, { fit: "cover", position: "centre" })
    .composite([{ input: sprite.data, left, top }])
    .png()
    .toBuffer();

  const outputPaths =
    entry.outputKind === "hero"
      ? [path.join(root, "scripts", "anime-art", "raw", "mgq", "heroes", `${entry.slug}-master.png`)]
      : ["few", "pack"].map((side) =>
          path.join(
            root,
            "scripts",
            "anime-art",
            "raw",
            "mgq",
            "units",
            `${entry.slug}-${side}-master.png`,
          ),
        );
  for (const outputPath of outputPaths) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await sharp(composed).toFile(outputPath);
    console.log(path.relative(root, outputPath));
  }
}

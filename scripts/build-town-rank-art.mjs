import fs from "node:fs";
import sharp from "sharp";
const { assets } = JSON.parse(
  fs.readFileSync("scripts/_codex-prompts/town-rank-revisions.json", "utf8"),
);
const out = "public/game-tokens/rank-ability/town-revisions";
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync("public/fx", { recursive: true });
await sharp(assets.find((a) => a.slug === "dwarf-fx").path)
  .resize(1024, 1024)
  .webp({ quality: 92 })
  .toFile("public/fx/town-dwarf-backlash.webp");
for (const asset of assets.filter((a) => a.slug !== "dwarf-fx")) {
  await sharp(asset.path)
    .resize(256, 256)
    .webp({ quality: 90 })
    .toFile(`${out}/${asset.slug}.webp`);
}
const previews = await Promise.all(
  assets
    .filter((a) => a.slug !== "dwarf-fx")
    .map(async (a, i) => ({
      input: await sharp(`${out}/${a.slug}.webp`).resize(150, 150).toBuffer(),
      left: (i % 5) * 160,
      top: Math.floor(i / 5) * 160,
    })),
);
await sharp({
  create: { width: 800, height: 640, channels: 3, background: "#202020" },
})
  .composite(previews)
  .webp({ quality: 90 })
  .toFile("artifacts/town-rank-icons.webp");

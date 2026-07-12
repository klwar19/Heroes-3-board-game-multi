#!/usr/bin/env node
/**
 * Castle-style assemble:
 *  1. Bare empty board + English definition cards composited in place
 *  2. Building tiles cropped separately
 *  3. Full board = empty + all tiles placed in top slots
 */
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const SESS =
  "C:/Users/klwar/.grok/sessions/C%3A%5CUsers%5Cklwar%5CHeroes-3-board-game-multi/019f578e-30d9-7c61-a591-65386be30d96/images";
const REVIEW = path.join(ROOT, "review");
const FINAL = path.join(ROOT, "final");
const WORK = path.join(ROOT, "work");

for (const f of fs.readdirSync(REVIEW)) {
  const p = path.join(REVIEW, f);
  if (fs.statSync(p).isDirectory()) {
    for (const c of fs.readdirSync(p)) fs.unlinkSync(path.join(p, c));
  } else {
    fs.unlinkSync(p);
  }
}
fs.mkdirSync(FINAL, { recursive: true });
fs.mkdirSync(path.join(REVIEW, "tiles"), { recursive: true });
fs.mkdirSync(path.join(WORK, "defs-en"), { recursive: true });

const coords = JSON.parse(fs.readFileSync(path.join(WORK, "def-coords.json"), "utf8"));

const DEF_EN = {
  cove: {
    city_hall: path.join(SESS, "8.jpg"),
    citadel: path.join(SESS, "2.jpg"),
    mage_guild: path.join(SESS, "4.jpg"),
    thieves_guild: path.join(SESS, "1.jpg"),
    pub: path.join(SESS, "3.jpg")
  },
  conflux: {
    city_hall: path.join(SESS, "7.jpg"),
    citadel: path.join(SESS, "9.jpg"),
    mage_guild: path.join(SESS, "12.jpg"),
    magic_university: path.join(SESS, "11.jpg"),
    garden_of_life: path.join(SESS, "10.jpg")
  }
};

const TILE_ORDER = {
  cove: [
    "thieves_guild",
    "city_hall",
    "dwelling_bronze",
    "mage_guild",
    "dwelling_gold",
    "citadel",
    "dwelling_silver"
  ],
  conflux: [
    "city_hall",
    "magic_university",
    "mage_guild",
    "dwelling_silver",
    "dwelling_gold",
    "citadel",
    "dwelling_bronze"
  ]
};

async function contentBBox(boardPath) {
  const { data, info } = await sharp(boardPath).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const w = info.width,
    h = info.height;
  const isBg = (x, y) => {
    const i = (y * w + x) * 4;
    return data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200 && Math.abs(data[i] - data[i + 1]) < 25;
  };
  let minX = w,
    maxX = 0,
    minY = h,
    maxY = 0,
    n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isBg(x, y)) {
        n++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (n < 100 || maxX - minX < w * 0.4) return { left: 0, top: 0, width: w, height: h };
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

async function buildEmptyEn(faction) {
  const bare = path.join(WORK, "boards", `${faction}-bare-pl.webp`);
  const overlays = [];
  for (const c of coords[faction]) {
    const src = DEF_EN[faction][c.id];
    if (!src || !fs.existsSync(src)) {
      console.warn("missing def", faction, c.id, src);
      continue;
    }
    const cardBuf = await sharp(src).resize(c.width, c.height, { fit: "fill" }).png().toBuffer();
    await sharp(cardBuf).webp({ quality: 92 }).toFile(path.join(WORK, "defs-en", `${faction}-${c.id}.webp`));
    overlays.push({ input: cardBuf, left: c.left, top: c.top });
    console.log("overlay", faction, c.id, `@${c.left},${c.top} ${c.width}x${c.height}`);
  }
  const withDefs = path.join(WORK, "boards", `${faction}-empty-en-raw.webp`);
  await sharp(bare).composite(overlays).webp({ quality: 92 }).toFile(withDefs);

  const bbox = await contentBBox(withDefs);
  const tight = path.join(FINAL, `towns-${faction}-empty.webp`);
  await sharp(withDefs).extract(bbox).webp({ quality: 92 }).toFile(tight);
  await sharp(tight).toFile(path.join(REVIEW, `${faction}-empty-board.webp`));
  console.log("empty", faction, tight, bbox);
  return { emptyPath: tight, bbox, rawW: (await sharp(withDefs).metadata()).width };
}

async function placeTiles(faction, emptyPath) {
  const meta = await sharp(emptyPath).metadata();
  const W = meta.width;
  const H = meta.height;

  // Top window tile slots (scalloped bars) — fractions of the empty board photo
  const slotTop = Math.round(H * 0.055);
  const slotH = Math.round(H * 0.375);
  const slotLeft0 = Math.round(W * 0.075);
  const slotRight = Math.round(W * 0.925);
  const barW = Math.floor((slotRight - slotLeft0) / 7);

  const comps = [];
  for (let i = 0; i < 7; i++) {
    const id = TILE_ORDER[faction][i];
    const tilePath = path.join(WORK, "tiles", `${faction}-${id}.webp`);
    if (!fs.existsSync(tilePath)) {
      console.warn("no tile", tilePath);
      continue;
    }
    const tw = barW - 2;
    const th = slotH;
    const left = slotLeft0 + i * barW + 1;
    const buf = await sharp(tilePath).resize(tw, th, { fit: "cover", position: "centre" }).png().toBuffer();
    comps.push({ input: buf, left, top: slotTop });

    // individual tile export (portrait)
    await sharp(tilePath)
      .resize(385, 813, { fit: "cover", position: "centre" })
      .webp({ quality: 92 })
      .toFile(path.join(FINAL, `${faction}-${id}.webp`));
    await sharp(tilePath).webp({ quality: 92 }).toFile(path.join(REVIEW, "tiles", `${faction}-${id}.webp`));
    console.log("slot", faction, i, id, left, slotTop, tw, th);
  }

  const fullPath = path.join(FINAL, `towns-${faction}-full.webp`);
  await sharp(emptyPath).composite(comps).webp({ quality: 92 }).toFile(fullPath);
  await sharp(fullPath).toFile(path.join(REVIEW, `${faction}-full-board.webp`));
  console.log("full", fullPath);
}

async function tileSheet(faction) {
  const tw = 120;
  const th = 260;
  const thumbs = [];
  for (const id of TILE_ORDER[faction]) {
    const p = path.join(REVIEW, "tiles", `${faction}-${id}.webp`);
    if (!fs.existsSync(p)) continue;
    thumbs.push(await sharp(p).resize(tw, th, { fit: "cover" }).png().toBuffer());
  }
  const comps = thumbs.map((b, i) => ({ input: b, left: 8 + i * (tw + 6), top: 8 }));
  await sharp({
    create: {
      width: 8 + thumbs.length * (tw + 6),
      height: th + 16,
      channels: 3,
      background: { r: 20, g: 16, b: 12 }
    }
  })
    .composite(comps)
    .webp({ quality: 90 })
    .toFile(path.join(REVIEW, `${faction}-tiles-strip.webp`));
}

for (const fac of ["cove", "conflux"]) {
  const { emptyPath } = await buildEmptyEn(fac);
  await placeTiles(fac, emptyPath);
  await tileSheet(fac);
}

fs.writeFileSync(
  path.join(REVIEW, "README.md"),
  `# Cove / Conflux — Castle-style town boards

Like Castle (\`towns-castle-empty.webp\` + \`towns-castle-full.webp\`):

1. **Empty board** — bare slots + English definition panels (slot nameplates left as printed)
2. **Building tiles** — cropped separately, placed onto slots when built
3. **Full board** — empty + all tiles seated (preview)

## Open this folder

\`assets-to-translate/cove-conflux-town-boards/review/\`

| File | What |
|------|------|
| \`cove-empty-board.webp\` | Bare Cove, English defs only |
| \`conflux-empty-board.webp\` | Bare Conflux, English defs only |
| \`cove-full-board.webp\` | Empty + 7 tiles placed |
| \`conflux-full-board.webp\` | Empty + 7 tiles placed |
| \`cove-tiles-strip.webp\` / \`conflux-tiles-strip.webp\` | Tile contact strips |
| \`tiles/\` | Each building tile alone |

## final/ (ship-ready names)

- \`towns-cove-empty.webp\` / \`towns-cove-full.webp\`
- \`towns-conflux-empty.webp\` / \`towns-conflux-full.webp\`
- \`cove-<building>.webp\` / \`conflux-<building>.webp\` tiles
`
);

console.log("DONE →", REVIEW);

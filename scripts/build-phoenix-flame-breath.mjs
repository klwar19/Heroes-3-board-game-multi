#!/usr/bin/env node
/** Build the 16-frame ImageGen phoenix breath master into its runtime atlas. */
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, "scripts", "anime-art", "raw", "phoenix-flame-breath-v2.png");
const output = path.join(root, "public", "fx", "phoenix-flame-flow-animated.webp");
const columns = 4;
const rows = 4;
const frameWidth = 418;
const frameHeight = 168;
const metadata = await sharp(source).metadata();
if (metadata.width !== 1672 || metadata.height !== 941 || !metadata.hasAlpha) {
  throw new Error(`Unexpected phoenix master: ${metadata.width}x${metadata.height}, alpha=${metadata.hasAlpha}`);
}

// ImageGen leaves extremely faint colored pixels in nominally empty alpha.
// Remove only that near-transparent contamination while retaining antialiasing.
const { data: cleanedPixels, info: cleanedInfo } = await sharp(source)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
for (let offset = 0; offset < cleanedPixels.length; offset += 4) {
  const alpha = cleanedPixels[offset + 3];
  if (alpha <= 32) {
    cleanedPixels[offset] = 0;
    cleanedPixels[offset + 1] = 0;
    cleanedPixels[offset + 2] = 0;
    cleanedPixels[offset + 3] = 0;
  } else {
    cleanedPixels[offset + 3] = Math.min(255, Math.round((alpha - 32) * 255 / 223));
  }
}
const cleanedSource = { raw: cleanedInfo };

const frames = [];
for (let row = 0; row < rows; row += 1) {
  const cellTop = Math.round(row * metadata.height / rows);
  const cellBottom = Math.round((row + 1) * metadata.height / rows);
  const cellHeight = cellBottom - cellTop;
  const top = cellTop + Math.floor((cellHeight - frameHeight) / 2);
  for (let column = 0; column < columns; column += 1) {
    frames.push(await sharp(cleanedPixels, cleanedSource).extract({
      left: column * frameWidth,
      top,
      width: frameWidth,
      height: frameHeight,
    }).png().toBuffer());
  }
}

await sharp({
  create: {
    width: frameWidth * columns,
    height: frameHeight * rows,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite(frames.map((input, index) => ({
    input,
    left: index % columns * frameWidth,
    top: Math.floor(index / columns) * frameHeight,
  })))
  .webp({ quality: 42, alphaQuality: 100, effort: 6, smartSubsample: true, preset: "picture" })
  .toFile(output);

const result = await sharp(output).metadata();
process.stdout.write(`${path.relative(root, output)} ${result.width}x${result.height}, 16 frames at ${frameWidth}x${frameHeight}\n`);

#!/usr/bin/env node
/**
 * Aggressively compress the shipped ImageGen combat-animation atlases.
 *
 * The atlas dimensions, alpha-channel presence, frame layout and file paths are
 * preserved, so the runtime declarations in src/data/fx.ts and fx-manifest.json
 * remain authoritative. Source/master art is deliberately excluded.
 *
 * Usage: node scripts/compress-imagegen-fx.mjs
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const restoreFromHead = process.argv.includes("--restore-from-head");
const startAtArg = process.argv.find((argument) => argument.startsWith("--start-at="));
const startAt = startAtArg?.slice("--start-at=".length);
const execFileP = promisify(execFile);
const publicFx = path.join(root, "public", "fx");
const extraAtlases = [
  "public/assets/fx/akagi-full-barrage.webp",
  "public/assets/fx/low-roll-extra-shot-projectile.webp",
  "public/assets/fx/sniper-shot-projectile.webp",
  "public/assets/fx/sniper-shot-hit.webp",
];

async function walkWebp(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkWebp(absolute));
    else if (entry.name.toLowerCase().endsWith(".webp")) files.push(absolute);
  }
  return files;
}

const animationAtlases = (await walkWebp(publicFx)).filter((absolute) => {
  const name = path.basename(absolute);
  if (name.endsWith("-source.webp")) return false;
  // These are ImageGen art, but single-frame projectiles rather than animation atlases.
  if (name.startsWith("war-machine-") && name.endsWith("-projectile.webp")) return false;
  return true;
});
let files = [...animationAtlases, ...extraAtlases.map((relative) => path.join(root, relative))];
if (startAt) {
  const index = files.findIndex((absolute) => path.basename(absolute) === startAt);
  if (index === -1) throw new Error(`Unknown --start-at file: ${startAt}`);
  files = files.slice(index);
}

async function retryWrite(absolute, contents) {
  let lastError;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      await writeFile(absolute, contents);
      return;
    } catch (error) {
      lastError = error;
      if (!["UNKNOWN", "EPERM", "EBUSY", "EACCES"].includes(error.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, Math.min(200 * attempt, 2000)));
    }
  }
  throw lastError;
}

let headManifest;
if (restoreFromHead) {
  const { stdout } = await execFileP("git", ["show", "HEAD:media-manifest.json"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  headManifest = JSON.parse(stdout);
}

async function originalInput(absolute) {
  if (!restoreFromHead) return readFile(absolute);
  const relative = path.relative(root, absolute).split(path.sep).join("/");
  if (relative.startsWith("public/fx/")) {
    const { stdout } = await execFileP("git", ["show", `HEAD:${relative}`], {
      cwd: root,
      encoding: "buffer",
      maxBuffer: 8 * 1024 * 1024,
    });
    return stdout;
  }
  const mediaKey = relative.replace(/^public\//u, "");
  const entry = headManifest.files[mediaKey];
  if (!entry) throw new Error(`Missing HEAD media entry for ${mediaKey}`);
  const extension = path.posix.extname(mediaKey);
  const objectKey = `${mediaKey.slice(0, -extension.length)}.${entry.md5.slice(0, 8)}${extension}`;
  const response = await fetch(`${headManifest.cdn.replace(/\/+$/u, "")}/${objectKey}`);
  if (!response.ok) throw new Error(`Could not restore ${mediaKey}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

let totalBefore = 0;
let totalAfter = 0;
let rewritten = 0;

for (const absolute of files) {
  const input = await originalInput(absolute);
  const before = input.length;
  const original = await sharp(input).metadata();
  const output = await sharp(input)
    .webp({
      quality: 42,
      // Alpha must remain effectively lossless: lossy alpha turns hidden RGB
      // in transparent ImageGen padding into colored block artifacts.
      alphaQuality: 100,
      effort: 6,
      smartSubsample: true,
      preset: "picture",
    })
    .toBuffer();
  const compressed = await sharp(output).metadata();

  if (compressed.width !== original.width || compressed.height !== original.height) {
    throw new Error(`Dimension drift for ${path.relative(root, absolute)}`);
  }
  if (Boolean(compressed.hasAlpha) !== Boolean(original.hasAlpha)) {
    throw new Error(`Alpha-channel drift for ${path.relative(root, absolute)}`);
  }

  let after = before;
  // Avoid generational loss when this maintenance command is rerun over an
  // already-compressed checkout; require a material win before replacing.
  if (output.length <= before * 0.95) {
    // The complete source and encoded result are already resident in memory;
    // direct replacement avoids Windows AV races when renaming over a WebP.
    await retryWrite(absolute, output);
    after = output.length;
    rewritten += 1;
  }

  totalBefore += before;
  totalAfter += after;
  process.stdout.write(
    `${path.relative(root, absolute)} ${(before / 1024).toFixed(1)}KB -> ${(after / 1024).toFixed(1)}KB\n`,
  );
}

const saved = totalBefore - totalAfter;
process.stdout.write(
  `Compressed ${rewritten}/${files.length} atlases: `
  + `${(totalBefore / 1048576).toFixed(2)}MB -> ${(totalAfter / 1048576).toFixed(2)}MB `
  + `(${(saved / 1048576).toFixed(2)}MB, ${(saved / totalBefore * 100).toFixed(1)}% saved)\n`,
);

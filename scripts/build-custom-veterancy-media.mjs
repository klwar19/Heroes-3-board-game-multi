import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

// Technical preparation of the original ImageGen animation sheets.
// Sources and prompts live together so no personal machine path is required.
const sourceDir = "scripts/custom-veterancy-art";
const out = "public/fx/custom-town";
const icons = "public/game-tokens/rank-ability/custom-town";
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(icons, { recursive: true });
const keys = ["muscle-reversal", "returning-edge", "covering-extraction", "meridian-exchange", "rule-unravel", "field-repair", "break-cover", "clear-mind", "rescue-step", "blood-price"];

for (const [index, key] of keys.entries()) {
  const input = path.join(sourceDir, `${key}.png`);
  const { width, height } = await sharp(input).metadata();
  if (!width || !height) throw new Error(`Unreadable source ${input}`);
  const tiles = [];
  for (let frame = 0; frame < 16; frame++) {
    const x = frame % 4, y = Math.floor(frame / 4);
    const left = Math.floor(x * width / 4) + 3, top = Math.floor(y * height / 4) + 3;
    const cellWidth = Math.floor((x + 1) * width / 4) - left - 3;
    const cellHeight = Math.floor((y + 1) * height / 4) - top - 3;
    // Crop only the cell dividers; keep each effect's internal motion/alignment.
    const tile = await sharp(input).extract({ left, top, width: cellWidth, height: cellHeight })
      .resize(248, 248).extend({ top: 4, bottom: 4, left: 4, right: 4, background: "black" }).png().toBuffer();
    tiles.push({ input: tile, left: x * 256, top: y * 256 });
    if (frame === 5) await sharp(tile).webp({ quality: 82, effort: 6 }).toFile(path.join(icons, `${key}.webp`));
  }
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: "black" } })
    .composite(tiles).webp({ quality: 76, effort: 6 }).toFile(path.join(out, `${key}.webp`));

  // Original synthesized foley: impact, blade swish, tracer/extraction,
  // paired qi chimes, chain fracture, and recovery bell. No borrowed voices.
  const rate = 44100, seconds = 0.95, samples = Math.floor(rate * seconds);
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + samples * 2, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(samples * 2, 40);
  let seed = 713 + index, filteredNoise = 0;
  const tone = (t, frequency, decay, start = 0) => t < start ? 0 : Math.sin(2 * Math.PI * frequency * (t - start)) * Math.exp(-decay * (t - start));
  for (let i = 0; i < samples; i++) {
    const t = i / rate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    filteredNoise += 0.24 * (noise - filteredNoise);
    let value;
    if (index === 0) value = 0.55 * tone(t, 90, 14, 0.10) + 0.4 * filteredNoise * Math.exp(-50 * Math.abs(t - 0.12)) + 0.12 * tone(t, 340, 9, 0.14);
    else if (index === 1) value = filteredNoise * 0.7 * Math.exp(-45 * (t - 0.27) ** 2) + 0.16 * tone(t, 1280, 12, 0.28) + 0.1 * tone(t, 1920, 10, 0.30);
    else if (index === 2) value = [0.03, 0.13, 0.23].reduce((n, start) => n + 0.28 * tone(t, 180, 32, start) + (t >= start ? 0.55 * filteredNoise * Math.exp(-40 * (t - start)) : 0), 0) + 0.13 * tone(t, 740, 8, 0.38);
    else if (index === 3) value = 0.22 * tone(t, 523, 5) + 0.19 * tone(t, 784, 5, 0.16) + 0.15 * tone(t, 1047, 6, 0.32);
    else if (index === 4) value = 0.25 * tone(t, 1397, 16, 0.07) + 0.2 * tone(t, 1865, 16, 0.12) + 0.4 * filteredNoise * Math.exp(-65 * Math.abs(t - 0.15)) + 0.17 * tone(t, 659, 6, 0.3);
    else if (index === 5) value = 0.23 * tone(t, 659, 6, 0.06) + 0.18 * tone(t, 988, 6, 0.23) + 0.14 * tone(t, 1319, 6, 0.39);
    else if (index === 6) value = 0.5 * tone(t, 68, 14, 0.12) + 0.6 * filteredNoise * Math.exp(-30 * Math.abs(t - 0.15)) + 0.2 * filteredNoise * Math.exp(-12 * Math.abs(t - 0.38));
    else if (index === 7) value = 0.2 * tone(t, 880, 5, 0.05) + 0.15 * tone(t, 1320, 5, 0.23) + 0.1 * tone(t, 1760, 5, 0.40);
    else if (index === 8) value = 0.3 * filteredNoise * Math.exp(-35 * (t - 0.3) ** 2) + 0.2 * tone(t, 440, 8, 0.08) + 0.15 * tone(t, 660, 7, 0.33);
    else value = 0.3 * tone(t, 110, 12, 0.08) + 0.4 * filteredNoise * Math.exp(-50 * (t - 0.28) ** 2) + 0.16 * tone(t, 1661, 16, 0.30);
    const fade = Math.min(1, t / 0.012, (seconds - t) / 0.07);
    wav.writeInt16LE(Math.round(Math.max(-0.85, Math.min(0.85, value * fade)) * 32767), 44 + i * 2);
  }
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", "pipe:0", "-af", "lowpass=f=7000,alimiter=limit=0.85:level=false", "-codec:a", "libmp3lame", "-b:a", "96k", path.join(out, `${key}.mp3`)], { input: wav });
}
await sharp({ create: { width: 768, height: Math.ceil(keys.length / 3) * 256, channels: 4, background: "#10151e" } })
  .composite(keys.map((key, index) => ({ input: path.join(icons, `${key}.webp`), left: index % 3 * 256, top: Math.floor(index / 3) * 256 })))
  .webp({ quality: 92 }).toFile("docs/custom-veterancy-icons.webp");
console.log(`Prepared ${keys.length} icons, 16-frame sheets and original sound cues, plus the icon contact sheet.`);

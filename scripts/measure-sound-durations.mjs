#!/usr/bin/env node
/**
 * Measure the playback length of every converted sound under public/sounds and
 * write public/sounds/durations.json (manifest key -> milliseconds).
 *
 * The table presentation needs these so a spell's sound effect — not just its
 * sprite — can finish before the damage / heal / death it caused is revealed
 * (see src/data/fx.ts `spellPresentationMs`). Durations are read straight from
 * the MP3 frame headers (no external tools), walking every frame so VBR files
 * measure correctly.
 *
 * Regenerate after re-converting sounds:
 *   node scripts/measure-sound-durations.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOUNDS = path.join(ROOT, "public", "sounds");

// MPEG audio frame tables. Index: [versionRow][bitrateIndex] (kbit/s).
const BITRATES = {
  // MPEG1: Layer1, Layer2, Layer3
  "1-1": [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 0],
  "1-2": [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 0],
  "1-3": [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
  // MPEG2 / 2.5: Layer1, Layer2&3
  "2-1": [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, 0],
  "2-2": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
};
const SAMPLE_RATES = {
  3: [44100, 48000, 32000], // MPEG1
  2: [22050, 24000, 16000], // MPEG2
  0: [11025, 12000, 8000] // MPEG2.5
};

/** Parse one frame header; returns { frameLength, sampleRate, samples } or null. */
function parseFrame(buf, i) {
  if (i + 4 > buf.length) return null;
  const h = buf.readUInt32BE(i);
  // Frame sync = top 11 bits all set. Test via unsigned shift; a bitwise AND
  // would yield a signed int that never compares equal to the literal.
  if ((h >>> 21) !== 0x7ff) return null;
  const versionBits = (h >> 19) & 3; // 3=MPEG1, 2=MPEG2, 0=MPEG2.5, 1=reserved
  const layerBits = (h >> 17) & 3; // 3=L1, 2=L2, 1=L3, 0=reserved
  if (versionBits === 1 || layerBits === 0) return null;
  const bitrateIndex = (h >> 12) & 15;
  const sampleIndex = (h >> 10) & 3;
  const padding = (h >> 9) & 1;
  if (bitrateIndex === 0 || bitrateIndex === 15 || sampleIndex === 3) return null;

  const layer = 4 - layerBits; // 1, 2 or 3
  const versionGroup = versionBits === 3 ? "1" : "2";
  // MPEG2/2.5 Layer 2 and Layer 3 share one bitrate table.
  const tableLayer = versionGroup === "2" && layer === 3 ? 2 : layer;
  const bitrate = BITRATES[`${versionGroup}-${tableLayer}`]?.[bitrateIndex];
  if (!bitrate) return null;
  const sampleRate = SAMPLE_RATES[versionBits]?.[sampleIndex];
  if (!sampleRate) return null;

  let frameLength;
  let samples;
  if (layer === 1) {
    frameLength = ((12 * bitrate * 1000) / sampleRate + padding) * 4;
    samples = 384;
  } else {
    samples = layer === 3 && versionBits !== 3 ? 576 : 1152;
    const coef = samples / 8;
    frameLength = Math.floor((coef * bitrate * 1000) / sampleRate) + padding;
  }
  if (!Number.isFinite(frameLength) || frameLength <= 0) return null;
  return { frameLength: Math.floor(frameLength), sampleRate, samples };
}

function durationMs(file) {
  const buf = fs.readFileSync(file);
  let i = 0;
  // Skip an ID3v2 tag if present.
  if (buf.length > 10 && buf.toString("ascii", 0, 3) === "ID3") {
    const size =
      ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    i = 10 + size;
  }
  let seconds = 0;
  let frames = 0;
  while (i < buf.length - 4) {
    const frame = parseFrame(buf, i);
    if (!frame) {
      i += 1;
      continue;
    }
    seconds += frame.samples / frame.sampleRate;
    i += frame.frameLength;
    frames += 1;
  }
  return frames > 0 ? Math.round(seconds * 1000) : 0;
}

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else if (name.endsWith(".mp3")) out.push(full);
  }
  return out;
}

const durations = {};
for (const file of walk(SOUNDS).sort()) {
  const key = path.relative(SOUNDS, file).replace(/\\/g, "/").replace(/\.mp3$/, "");
  durations[key] = durationMs(file);
}

const outPath = path.join(SOUNDS, "durations.json");
fs.writeFileSync(outPath, JSON.stringify(durations, null, 2) + "\n");
console.log(`Wrote ${Object.keys(durations).length} sound durations to ${path.relative(ROOT, outPath)}`);

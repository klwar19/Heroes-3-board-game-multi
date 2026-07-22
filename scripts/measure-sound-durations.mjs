#!/usr/bin/env node
/**
 * Measure the playback length of every converted sound under public/sounds and
 * write public/sounds/durations.json (manifest key -> milliseconds).
 *
 * The table presentation needs these so a spell's sound effect — not just its
 * sprite — can finish before the damage / heal / death it caused is revealed
 * (see src/data/fx.ts `spellPresentationMs`). Durations are read straight from
 * the file headers (no external tools): MP3 by walking every MPEG frame so VBR
 * files measure correctly, and Ogg Vorbis (the Azur Lane Japanese voices) from
 * the identification header's sample rate + the last page's granule position.
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

function mp3DurationMs(file) {
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

/**
 * Ogg Vorbis playback length. The Vorbis identification header (packet 0x01
 * "vorbis") carries the sample rate; the total sample count is the granule
 * position of the file's LAST page (Vorbis granule == PCM samples decoded).
 * Duration = totalSamples / sampleRate. Verified against ffprobe (0 ms delta on
 * every Azur Lane clip). No external tools, matching the MP3 path above.
 */
function oggDurationMs(file) {
  const buf = fs.readFileSync(file);
  // 0x01 "vorbis" then vorbis_version(4) audio_channels(1) sample_rate(4 LE).
  const idStart = buf.indexOf(Buffer.from([0x01, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73]));
  if (idStart < 0) return 0;
  const sampleRate = buf.readUInt32LE(idStart + 12);
  if (!sampleRate) return 0;
  // Walk every Ogg page (capture "OggS", header 27 bytes + segment table), and
  // keep the last granule that is set (0xFFFF…FF marks a page finishing no
  // packet). The final page's granule is the stream's total sample count.
  let i = 0;
  let lastGranule = 0n;
  const NO_PACKET = 0xffffffffffffffffn;
  while (i + 27 <= buf.length) {
    if (buf.toString("ascii", i, i + 4) !== "OggS") break; // pages are aligned from byte 0
    const granule = buf.readBigUInt64LE(i + 6);
    const segCount = buf[i + 26];
    const segTableStart = i + 27;
    if (segTableStart + segCount > buf.length) break;
    let bodyLen = 0;
    for (let s = 0; s < segCount; s += 1) bodyLen += buf[segTableStart + s];
    if (granule !== NO_PACKET) lastGranule = granule;
    i = segTableStart + segCount + bodyLen;
  }
  return Math.round((Number(lastGranule) / sampleRate) * 1000);
}

function durationMs(file) {
  return file.endsWith(".ogg") ? oggDurationMs(file) : mp3DurationMs(file);
}

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else if (name.endsWith(".mp3") || name.endsWith(".ogg")) out.push(full);
  }
  return out;
}

const durations = {};
for (const file of walk(SOUNDS).sort()) {
  const key = path.relative(SOUNDS, file).replace(/\\/g, "/").replace(/\.(mp3|ogg)$/, "");
  durations[key] = durationMs(file);
}

const outPath = path.join(SOUNDS, "durations.json");
fs.writeFileSync(outPath, JSON.stringify(durations, null, 2) + "\n");
console.log(`Wrote ${Object.keys(durations).length} sound durations to ${path.relative(ROOT, outPath)}`);

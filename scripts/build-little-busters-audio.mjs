#!/usr/bin/env node
/**
 * Build the Little Busters battle voice pack from the user's OGGPAK exports.
 *
 * OGGPAK stores the same mono Vorbis clip twice (44.1 kHz and 48 kHz). This
 * importer takes only the first logical Ogg stream, normalizes it, and creates
 * virtual manifest entries. Attack/shoot variants always sequence voice first,
 * then the character-appropriate impact. Rin's Cats insert one of RIN/RIN2/RIN3
 * between Rin's voice and the final impact.
 */
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = path.join(ROOT, "scripts", "anime-art", "little-busters-audio.json");
const MANIFEST_PATH = path.join(ROOT, "public", "sounds", "manifest.json");
const OUTPUT_ROOT = path.join(ROOT, "public", "sounds", "little-busters");
const ACTIONS = ["attack", "shoot", "defend", "hurt", "death", "move"];
const SEQUENCED_ACTIONS = new Set(["attack", "shoot"]);

const config = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
const battleVoiceRoot = process.env.LB_BATTLE_VOICE_ROOT || config.battleVoiceRoot;
const kanataRoot = process.env.LB_KANATA_VOICE_ROOT || config.kanataRoot;
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "little-busters-audio-"));

function safePart(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function assertSource(file, label) {
  let info;
  try {
    info = await stat(file);
  } catch {
    throw new Error(`${label} is missing: ${file}`);
  }
  if (!info.isFile() || info.size < 64) throw new Error(`${label} is not usable: ${file}`);
}

async function usableOgg(file) {
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size < 64) return false;
    const bytes = await readFile(file);
    return bytes.toString("ascii", 0, 4) === "OggS";
  } catch {
    return false;
  }
}

async function writeWithRetries(file, contents, attempts = 10) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await writeFile(file, contents);
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }
}

/** Return the clean first logical Ogg stream from an OGGPAK buffer. */
function unpackFirstOgg(buffer, label) {
  const starts = [];
  for (let index = 0; index <= buffer.length - 6; index += 1) {
    if (
      buffer[index] === 0x4f && buffer[index + 1] === 0x67 &&
      buffer[index + 2] === 0x67 && buffer[index + 3] === 0x53 &&
      (buffer[index + 5] & 0x02) !== 0
    ) {
      starts.push(index);
      if (starts.length === 2) break;
    }
  }
  if (starts.length === 0) throw new Error(`${label} contains no Ogg BOS page`);
  return buffer.subarray(starts[0], starts[1] ?? buffer.length);
}

function encodeOgg(input, output, kind) {
  const filter = kind === "voice"
    ? "silenceremove=start_periods=1:start_duration=0.005:start_threshold=-55dB,highpass=f=70,lowpass=f=11000,loudnorm=I=-18:TP=-1.5:LRA=7,apad=pad_dur=0.05"
    : "silenceremove=start_periods=1:start_duration=0.003:start_threshold=-58dB,atrim=0:1.8,highpass=f=40,lowpass=f=14000,loudnorm=I=-20:TP=-2:LRA=8,apad=pad_dur=0.04";
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-i", input, "-af", filter, "-ac", "1", "-ar", "44100",
    "-c:a", "libvorbis", "-q:a", kind === "voice" ? "4" : "5", output
  ], { stdio: "inherit" });
}

const entries = new Map();
function addEntry(key, value) {
  const previous = entries.get(key);
  if (previous && JSON.stringify(previous) !== JSON.stringify(value)) {
    throw new Error(`Conflicting manifest entry: ${key}`);
  }
  entries.set(key, value);
}

const builtSources = new Map();
async function buildPackedClip(baseName, sourceRoot, kind) {
  const sourceDir = sourceRoot === "kanata" ? kanataRoot : battleVoiceRoot;
  const input = path.join(sourceDir, `${baseName}.oggpak`);
  await assertSource(input, `${kind} source ${baseName}`);
  const id = safePart(baseName);
  const existing = builtSources.get(`${kind}:${sourceRoot}:${id}`);
  if (existing) return existing;

  const folder = kind === "effect" ? "effects" : "source";
  const outputDir = path.join(OUTPUT_ROOT, folder);
  const output = path.join(outputDir, `${id}.ogg`);
  const unpacked = path.join(tempRoot, `${kind}-${sourceRoot}-${id}.ogg`);
  await mkdir(outputDir, { recursive: true });
  if (!(await usableOgg(output))) {
    await writeFile(unpacked, unpackFirstOgg(await readFile(input), input));
    encodeOgg(unpacked, output, kind);
  }

  const key = `little-busters/${folder}/${id}`;
  addEntry(key, {
    src: `/sounds/little-busters/${folder}/${id}.ogg`,
    note: `${kind === "voice" ? "Little Busters battle voice" : "Little Busters battle effect"}: ${baseName}.oggpak (clean 44.1 kHz Ogg stream)`
  });
  builtSources.set(`${kind}:${sourceRoot}:${id}`, key);
  return key;
}

try {
  if (!Array.isArray(config.profiles) || config.profiles.length !== 13) {
    throw new Error(`Expected 13 character profiles; found ${config.profiles?.length ?? 0}`);
  }

  const profileVoiceKeys = new Map();
  for (const profile of config.profiles) {
    const actionNames = Object.keys(profile.clips).sort();
    if (actionNames.join("|") !== [...ACTIONS].sort().join("|")) {
      throw new Error(`${profile.slug} must map exactly: ${ACTIONS.join(", ")}`);
    }
    const sourceRoot = profile.sourceRoot || "battle";
    const byAction = {};
    for (const action of ACTIONS) {
      const clips = profile.clips[action];
      if (!Array.isArray(clips) || clips.length === 0 || clips.length > 3) {
        throw new Error(`${profile.slug}/${action} must contain 1-3 clips`);
      }
      byAction[action] = [];
      for (const clip of clips) byAction[action].push(await buildPackedClip(clip, sourceRoot, "voice"));
    }
    profileVoiceKeys.set(profile.slug, byAction);

    const effectKeys = [];
    for (const effect of profile.effects) effectKeys.push(await buildPackedClip(effect, "battle", "effect"));
    for (const action of ACTIONS) {
      const variants = [];
      for (let index = 0; index < byAction[action].length; index += 1) {
        const variantKey = `little-busters/voices/${profile.slug}/${action}-${index + 1}`;
        if (SEQUENCED_ACTIONS.has(action)) {
          addEntry(variantKey, {
            sequence: [byAction[action][index], effectKeys[index % effectKeys.length]],
            sequenceDelayMs: 35,
            note: `${profile.name} ${action}: randomized canonical voice, then a suitable battle effect`
          });
        } else {
          addEntry(variantKey, {
            src: entries.get(byAction[action][index]).src,
            note: `${profile.name} ${action} battle response`
          });
        }
        variants.push(variantKey);
      }
      addEntry(`little-busters/voices/${profile.slug}/${action}`, {
        random: variants,
        note: `${profile.name}: ${variants.length} curated ${action} variant${variants.length === 1 ? "" : "s"}`
      });
    }
  }

  const cats = config.cats;
  const rinVoices = profileVoiceKeys.get(cats.voiceProfile);
  if (!rinVoices) throw new Error(`Cat voice profile is missing: ${cats.voiceProfile}`);
  const catKeys = [];
  for (const sound of cats.sounds) catKeys.push(await buildPackedClip(sound, "battle", "effect"));
  const catEffectKeys = [];
  for (const effect of cats.effects) catEffectKeys.push(await buildPackedClip(effect, "battle", "effect"));
  for (const action of ACTIONS) {
    const variants = [];
    for (let index = 0; index < 3; index += 1) {
      const variantKey = `little-busters/voices/${cats.slug}/${action}-${index + 1}`;
      const sequence = [rinVoices[action][index % rinVoices[action].length], catKeys[index]];
      if (SEQUENCED_ACTIONS.has(action)) sequence.push(catEffectKeys[index]);
      addEntry(variantKey, {
        sequence,
        sequenceDelayMs: 30,
        note: `${cats.name} ${action}: Rin's voice, cat ${index + 1},${SEQUENCED_ACTIONS.has(action) ? " then attack effect" : " in that order"}`
      });
      variants.push(variantKey);
    }
    addEntry(`little-busters/voices/${cats.slug}/${action}`, {
      random: variants,
      note: `${cats.name}: Rin plus all three RIN/RIN2/RIN3 cat variants`
    });
  }

  const original = await readFile(MANIFEST_PATH, "utf8");
  const lines = original.split(/\r?\n/).filter((line) => !/^\s*"little-busters\//.test(line));
  let close = lines.length - 1;
  while (close >= 0 && lines[close].trim() === "") close -= 1;
  if (close < 0 || lines[close].trim() !== "}") throw new Error("Sound manifest does not end in an object close");
  const body = lines.slice(0, close);
  let last = body.length - 1;
  while (last >= 0 && body[last].trim() === "") last -= 1;
  body[last] = body[last].replace(/,\s*$/, "") + ",";
  const sorted = [...entries].sort(([a], [b]) => a.localeCompare(b));
  sorted.forEach(([key, value], index) => {
    body.push(`  ${JSON.stringify(key)}: ${JSON.stringify(value)}${index === sorted.length - 1 ? "" : ","}`);
  });
  body.push("}", "");
  const next = body.join("\n");
  JSON.parse(next);
  if (next !== original) await writeWithRetries(MANIFEST_PATH, next);
  process.stdout.write(`Built ${builtSources.size} Little Busters clips and registered ${entries.size} manifest entries.\n`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

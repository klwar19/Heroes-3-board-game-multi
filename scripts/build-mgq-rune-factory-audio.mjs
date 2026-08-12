#!/usr/bin/env node
/**
 * Build the Monster Girl Quest town's real female voice pack.
 *
 * Source voices are the user-supplied Rune Factory WAVs. Attack, forced-shoot,
 * and movement cues are manifest sequences: voice first, MGQ effect second.
 * The mapping (including rationale) lives in mgq-rune-factory-audio.json.
 */
import { execFileSync } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = path.join(ROOT, "scripts", "anime-art", "mgq-rune-factory-audio.json");
const MANIFEST_PATH = path.join(ROOT, "public", "sounds", "manifest.json");
const OUTPUT_ROOT = path.join(ROOT, "public", "sounds", "mgq");
const VOICE_OUTPUT = path.join(OUTPUT_ROOT, "rune-factory");
const EFFECT_OUTPUT = path.join(OUTPUT_ROOT, "effects");
const ACTIONS = ["attack", "shoot", "defend", "hurt", "death", "move"];
const SEQUENCED_ACTIONS = new Set(["attack", "shoot", "move"]);

const config = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
const voiceRoot = process.env.MGQ_RF_VOICE_ROOT || config.voiceRoot;
const effectRoot = process.env.MGQ_SE_ROOT || config.effectRoot;

function safePart(value) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function assertRealFile(file, label) {
  let info;
  try {
    info = await stat(file);
  } catch {
    throw new Error(`${label} is missing: ${file}`);
  }
  if (!info.isFile() || info.size < 64) {
    throw new Error(`${label} is not a usable audio file: ${file}`);
  }
}

function encodeOgg(input, output, kind) {
  const filter = kind === "voice"
    ? "silenceremove=start_periods=1:start_duration=0.01:start_threshold=-52dB:stop_periods=-1:stop_duration=0.08:stop_threshold=-52dB,highpass=f=75,lowpass=f=10500,loudnorm=I=-18:TP=-1.5:LRA=7,apad=pad_dur=0.05"
    : "silenceremove=start_periods=1:start_duration=0.005:start_threshold=-55dB,atrim=0:1.6,afade=t=out:st=1.48:d=0.12,highpass=f=45,lowpass=f=12500,loudnorm=I=-20:TP=-2:LRA=8,apad=pad_dur=0.04";
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-i", input,
    "-af", filter,
    "-ac", "1", "-ar", "44100", "-c:a", "libvorbis", "-q:a", "4",
    output
  ], { stdio: "inherit" });
}

function addEntry(entries, key, value) {
  const previous = entries.get(key);
  if (previous && JSON.stringify(previous) !== JSON.stringify(value)) {
    throw new Error(`Conflicting manifest entry for ${key}`);
  }
  entries.set(key, value);
}

if (!Array.isArray(config.profiles) || config.profiles.length !== 34) {
  throw new Error(`Expected exactly 34 MGQ voice profiles; found ${config.profiles?.length ?? 0}`);
}

await mkdir(VOICE_OUTPUT, { recursive: true });
await mkdir(EFFECT_OUTPUT, { recursive: true });

const entries = new Map();
const seenSlugs = new Set();
const builtVoiceFiles = new Map();
const builtEffectFiles = new Map();

for (const profile of config.profiles) {
  if (seenSlugs.has(profile.slug)) throw new Error(`Duplicate MGQ slug: ${profile.slug}`);
  seenSlugs.add(profile.slug);
  if (!profile.rationale?.trim()) throw new Error(`${profile.slug} has no voice rationale`);

  const clipActions = Object.keys(profile.clips).sort();
  if (clipActions.join("|") !== [...ACTIONS].sort().join("|")) {
    throw new Error(`${profile.slug} must map exactly these actions: ${ACTIONS.join(", ")}`);
  }

  for (const action of ACTIONS) {
    const clipName = profile.clips[action];
    const voiceSource = path.join(voiceRoot, profile.speaker, clipName);
    await assertRealFile(voiceSource, `${profile.slug}/${action} Rune Factory voice`);

    const speakerPart = safePart(profile.speaker.replace(/_JP$/i, ""));
    const clipPart = safePart(path.parse(clipName).name);
    const voiceId = `${speakerPart}-${clipPart}`;
    const voiceKey = `mgq/rune-factory/${voiceId}`;
    const voiceFile = path.join(VOICE_OUTPUT, `${voiceId}.ogg`);
    if (!builtVoiceFiles.has(voiceId)) {
      encodeOgg(voiceSource, voiceFile, "voice");
      builtVoiceFiles.set(voiceId, voiceFile);
    }
    addEntry(entries, voiceKey, {
      src: `/sounds/mgq/rune-factory/${voiceId}.ogg`,
      note: `Rune Factory female voice: ${profile.speaker}/${clipName}`
    });

    const mainKey = `mgq/voices/${profile.slug}/${action}`;
    const commonNote = `${profile.name}: ${profile.rationale} Source ${profile.speaker}/${clipName}.`;
    if (SEQUENCED_ACTIONS.has(action)) {
      const effectName = profile.effects?.[action];
      if (!effectName) throw new Error(`${profile.slug}/${action} has no post-voice effect`);
      const effectSource = path.join(effectRoot, effectName);
      await assertRealFile(effectSource, `${profile.slug}/${action} MGQ effect`);
      const effectId = safePart(path.parse(effectName).name);
      const effectKey = `mgq/effects/${effectId}`;
      const effectFile = path.join(EFFECT_OUTPUT, `${effectId}.ogg`);
      if (!builtEffectFiles.has(effectId)) {
        encodeOgg(effectSource, effectFile, "effect");
        builtEffectFiles.set(effectId, effectFile);
      }
      addEntry(entries, effectKey, {
        src: `/sounds/mgq/effects/${effectId}.ogg`,
        note: `MGQ Paradox 2.41 Audio/SE/${effectName}; normalized and capped at 1.6 seconds`
      });
      addEntry(entries, mainKey, {
        sequence: [voiceKey, effectKey],
        sequenceDelayMs: 35,
        note: `${commonNote} The ${action} effect follows the voice.`
      });
    } else {
      addEntry(entries, mainKey, {
        src: `/sounds/mgq/rune-factory/${voiceId}.ogg`,
        note: commonNote
      });
    }
  }
}

const original = await readFile(MANIFEST_PATH, "utf8");
const lines = original
  .split(/\r?\n/)
  .filter((line) => !/^\s*"mgq\/(?:voices|rune-factory|effects)\//.test(line));
let close = lines.length - 1;
while (close >= 0 && lines[close].trim() === "") close -= 1;
if (close < 0 || lines[close].trim() !== "}") {
  throw new Error("public/sounds/manifest.json does not end in a JSON object close");
}
const body = lines.slice(0, close);
let last = body.length - 1;
while (last >= 0 && body[last].trim() === "") last -= 1;
if (last < 0) throw new Error("Sound manifest has no existing properties");
body[last] = body[last].replace(/,\s*$/, "") + ",";

const sortedEntries = [...entries].sort(([a], [b]) => a.localeCompare(b));
for (let index = 0; index < sortedEntries.length; index += 1) {
  const [key, value] = sortedEntries[index];
  const comma = index === sortedEntries.length - 1 ? "" : ",";
  body.push(`  ${JSON.stringify(key)}: ${JSON.stringify(value)}${comma}`);
}
body.push("}", "");
const next = body.join("\n");
JSON.parse(next);
await writeFile(MANIFEST_PATH, next);

process.stdout.write(
  `Built ${builtVoiceFiles.size} Rune Factory voice assets, ${builtEffectFiles.size} MGQ effects, ` +
  `and ${config.profiles.length * ACTIONS.length} action mappings.\n`
);

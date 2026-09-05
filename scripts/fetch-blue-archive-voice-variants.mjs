#!/usr/bin/env node

// Downloads the FULL battle-voice set for every Blue Archive student (and the
// Ibuki commander) from bluearchive.wiki into
// public/sounds/blue-archive/voices/<slug>/<action>-<n>.ogg, so the player can
// pick a RANDOM line per action instead of replaying the single clip we shipped
// in the first pass.
//
// Network facts baked in (verified in this sandbox):
//   * The wiki's HTML 403s for a bot UA, but the MediaWiki API answers fine with
//     a browser UA:
//       /w/api.php?action=query&list=allimages&aiprefix=<Name>&ailimit=500&format=json
//     Every row carries `name` plus a direct `url` on static.wikitide.net.
//   * Node's fetch does NOT honor the sandbox HTTPS proxy; curl DOES — so every
//     request shells out to curl (same recipe as fetch-azur-lane-art.mjs).
//
// ENCODING: the wiki serves the game's own Ogg Vorbis, MONO 44.1 kHz at a
// 54 kbit/s nominal rate, and the clips we already shipped are BYTE-IDENTICAL
// copies of those files (verified: shiroko/attack.ogg == Shiroko_Battle_Shout_1
// .ogg, 6558 bytes). Re-encoding vorbis -> vorbis would only add generation loss
// at the same or a larger size, so a variant is copied VERBATIM. The one
// exception is a clip longer than MAX_SECONDS: it is trimmed (with a short
// fade-out) and re-encoded at the same mono/44.1 kHz/54 kbit/s settings.
//
// Idempotent: a variant already on disk is neither re-downloaded nor re-encoded.
// Prints a per-student table and writes a JSON report (the input for the
// manifest.json entries) next to the sounds tree.
//
// Run: node scripts/fetch-blue-archive-voice-variants.mjs [--slug shiroko] [--dry-run]

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const voiceRoot = path.join(root, "public", "sounds", "blue-archive", "voices");
const reportPath = path.join(root, "scripts", "blue-archive-voice-variants.report.json");

const UA = "Mozilla/5.0 (Windows NT 10.0) Chrome/126.0";
const API = "https://bluearchive.wiki/w/api.php";
const WIKI_PAGE = (name) => `https://bluearchive.wiki/wiki/${name}/audio`;
const MAX_SECONDS = 4.0;
const LEGACY_WIKI_NOTE = "(first-pass download; the wiki no longer lists this clip)";

// slug -> the wiki's file-name prefix. Derived from the `note` fields of the
// first-pass manifest entries ("Blue Archive <Prefix> — <Prefix>_Battle_...").
const STUDENTS = [
  ["aris", "Arisu_(Maid)"],
  ["aru", "Aru_(New_Year)"],
  ["azusa", "Azusa_(Swimsuit)"],
  ["hasumi", "Hasumi_(Swimsuit)"],
  ["hina", "Hina_(Dress)"],
  ["hoshino", "Hoshino_(Swimsuit)"],
  ["ibuki", "Ibuki"],
  ["iori", "Iori"],
  ["kei", "Kei"],
  ["mika", "Mika_(Swimsuit)"],
  ["miyo", "Miyo"],
  ["mutsuki", "Mutsuki"],
  ["nagisa", "Nagisa"],
  ["neru", "Neru_(School_Uniform)"],
  ["saori", "Saori_(Dress)"],
  ["seia", "Seia"],
  ["shiroko", "Shiroko"],
  ["toki", "Toki_(Bunny_Girl)"],
  ["wakamo", "Wakamo_(Swimsuit)"],
  ["yuuka", "Yuuka_(Pajama)"]
];

// action -> the ordered families of wiki clips that feed it. A family is tried
// whole (every numbered member, ascending) before the next one starts.
const ACTION_FAMILIES = {
  attack: ["Battle_Shout"],
  hurt: ["Battle_Damage"],
  defend: ["Battle_Defense", "Battle_Covered"],
  move: ["Battle_Move", "Battle_TacticalAction"],
  death: ["Battle_Retire"],
  ability: ["ExSkill"]
};

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const onlySlugArg = process.argv.indexOf("--slug");
const onlySlug = onlySlugArg > -1 ? process.argv[onlySlugArg + 1] : undefined;

function curl(url, outFile) {
  const flags = ["-sS", "--fail", "-A", UA, "--retry", "3", "--retry-delay", "2", url];
  if (outFile) {
    execFileSync("curl", [...flags, "-o", outFile], { stdio: ["ignore", "ignore", "inherit"] });
    return undefined;
  }
  return execFileSync("curl", flags, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** Every File: on the wiki whose name starts with `prefix` (paginated). */
function listImages(prefix) {
  const rows = [];
  let cont;
  for (let page = 0; page < 20; page += 1) {
    const url =
      `${API}?action=query&list=allimages&aiprefix=${encodeURIComponent(prefix)}` +
      `&ailimit=500&format=json${cont ? `&aicontinue=${encodeURIComponent(cont)}` : ""}`;
    const json = JSON.parse(curl(url));
    for (const row of json?.query?.allimages ?? []) rows.push(row);
    cont = json?.continue?.aicontinue;
    if (!cont) break;
  }
  return rows;
}

/**
 * The ordered clip list for one action. A family member is `<prefix>_<family>`
 * optionally followed by `_<n>` (and Mika's ExSkill ships as `_1_1`), so the
 * numeric tail is parsed and sorted; `ExSkill_Level_*` is a DIFFERENT line
 * (the skill-level-up voice) and is excluded.
 */
function clipsForAction(prefix, families, byName) {
  const picked = [];
  for (const family of families) {
    const base = `${prefix}_${family}`;
    const matches = [];
    for (const [name, row] of byName) {
      if (!name.endsWith(".ogg")) continue;
      if (name !== `${base}.ogg` && !name.startsWith(`${base}_`)) continue;
      const tail = name.slice(base.length, -4); // "" | "_1" | "_1_1" | "_Level_1"
      if (/[A-Za-z]/.test(tail)) continue; // ExSkill_Level_*, Battle_Damage_Long, ...
      const nums = tail.split("_").filter(Boolean).map(Number);
      if (nums.some((n) => !Number.isFinite(n))) continue;
      matches.push({ name, url: row.url, order: nums });
    }
    matches.sort((a, b) => {
      for (let i = 0; i < Math.max(a.order.length, b.order.length); i += 1) {
        const d = (a.order[i] ?? 0) - (b.order[i] ?? 0);
        if (d) return d;
      }
      return a.name.localeCompare(b.name);
    });
    picked.push(...matches);
  }
  return picked;
}

function durationOf(file) {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file],
    { encoding: "utf8" }
  );
  return Number.parseFloat(out.trim());
}

/** Copy verbatim; trim + re-encode only an over-long clip (see header). */
function install(tmpFile, target) {
  const seconds = durationOf(tmpFile);
  if (!Number.isFinite(seconds) || seconds <= MAX_SECONDS) {
    renameSync(tmpFile, target);
    return { seconds, trimmed: false };
  }
  execFileSync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", tmpFile,
      "-t", String(MAX_SECONDS),
      "-af", `afade=t=out:st=${(MAX_SECONDS - 0.25).toFixed(2)}:d=0.25`,
      "-c:a", "libvorbis", "-ac", "1", "-ar", "44100", "-b:a", "54k",
      target
    ],
    { stdio: ["ignore", "ignore", "inherit"] }
  );
  unlinkSync(tmpFile);
  return { seconds, trimmed: true };
}

const report = {};
const rows = [];

for (const [slug, prefix] of STUDENTS) {
  if (onlySlug && slug !== onlySlug) continue;
  const dir = path.join(voiceRoot, slug);
  mkdirSync(dir, { recursive: true });

  const byName = new Map(listImages(prefix).map((row) => [row.name, row]));
  report[slug] = { prefix, source: WIKI_PAGE(prefix), actions: {} };

  for (const [action, families] of Object.entries(ACTION_FAMILIES)) {
    const clips = clipsForAction(prefix, families, byName);
    const produced = [];
    for (let i = 0; i < clips.length; i += 1) {
      const clip = clips[i];
      const variant = i + 1;
      const target = path.join(dir, `${action}-${variant}.ogg`);
      const legacy = path.join(dir, `${action}.ogg`);

      if (existsSync(target) && statSync(target).size > 0) {
        produced.push({ variant, wiki: clip.name, bytes: statSync(target).size, state: "kept" });
        continue;
      }
      if (dryRun) {
        produced.push({ variant, wiki: clip.name, bytes: 0, state: "would-fetch" });
        continue;
      }
      // Variant 1 is the clip we already shipped as <action>.ogg — rename it in
      // place rather than re-downloading the same bytes.
      if (variant === 1 && existsSync(legacy) && statSync(legacy).size > 0) {
        renameSync(legacy, target);
        produced.push({ variant, wiki: clip.name, bytes: statSync(target).size, state: "renamed" });
        continue;
      }
      const tmp = `${target}.part`;
      curl(clip.url, tmp);
      const { seconds, trimmed } = install(tmp, target);
      produced.push({
        variant, wiki: clip.name, bytes: statSync(target).size,
        seconds: Number(seconds.toFixed(2)), state: trimmed ? "trimmed" : "fetched"
      });
    }
    // A clip the FIRST pass downloaded that the wiki no longer lists (Nagisa's
    // whole base-form battle set was pulled). Keep what we already have, as
    // variant 1, so every action ends up on the same `<action>-<n>.ogg` naming.
    if (produced.length === 0) {
      const legacy = path.join(dir, `${action}.ogg`);
      const target = path.join(dir, `${action}-1.ogg`);
      if (existsSync(target) && statSync(target).size > 0) {
        produced.push({ variant: 1, wiki: LEGACY_WIKI_NOTE, bytes: statSync(target).size, state: "kept" });
      } else if (existsSync(legacy) && statSync(legacy).size > 0 && !dryRun) {
        renameSync(legacy, target);
        produced.push({ variant: 1, wiki: LEGACY_WIKI_NOTE, bytes: statSync(target).size, state: "renamed-legacy" });
      }
    }

    report[slug].actions[action] = produced;
    rows.push({ slug, action, count: produced.length });
  }

  const summary = Object.entries(report[slug].actions)
    .map(([action, list]) => `${action}:${list.length}`)
    .join("  ");
  console.log(`${slug.padEnd(9)} ${prefix.padEnd(24)} ${summary}`);
}

if (!dryRun) writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `\n${rows.length} action pools, ${rows.reduce((n, r) => n + r.count, 0)} clips.` +
  (dryRun ? " (dry run)" : ` Report: ${path.relative(root, reportPath)}`)
);

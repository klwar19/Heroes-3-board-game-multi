#!/usr/bin/env node

// Downloads the Japanese battle voices for the two NEW Azur Lane shipgirls
// (Ayanami, Akagi) into public/sounds/azur-lane/voices/<slug>/<action>.ogg and
// registers the eight manifest entries, shaped exactly like the seven ships that
// already ship (see azur-lane/voices/laffey/*).
//
// Network facts baked in (verified in this sandbox):
//   * The koumakan wiki honeypots bots. The FANDOM MediaWiki API answers with a
//     browser UA:
//       https://blhx.fandom.com/api.php?action=query&list=allimages&aiprefix=Ayanami_&ailimit=500&format=json
//     Rows carry `name` plus a direct static.wikia.nocookie.net `url`.
//   * Node's fetch does NOT honor the sandbox HTTPS proxy; curl DOES.
//
// The game's own clips are already Ogg Vorbis mono 44.1 kHz, and the seven
// shipped ships are byte-identical copies of them, so a clip is copied VERBATIM
// (re-encoding vorbis -> vorbis is pure generation loss at the same size). Base
// skins only: the `...SkinNJP` alternates are a different outfit's line.
//
// Idempotent. Run: node scripts/fetch-azur-lane-new-ship-voices.mjs

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const voiceRoot = path.join(root, "public", "sounds", "azur-lane", "voices");
const manifestPath = path.join(root, "public", "sounds", "manifest.json");

const UA = "Mozilla/5.0 (Windows NT 10.0) Chrome/126.0";
const API = "https://blhx.fandom.com/api.php";

// slug -> the wiki's file-name prefix (the ship's base skin).
const SHIPS = [["ayanami", "Ayanami"], ["akagi", "Akagi"]];

// action -> [wiki suffix, the note the existing ships use].
const ACTIONS = [
  ["attack", "SkillActivationJP", "Japanese Skill Activation voice"],
  ["hurt", "LowHPJP", "Japanese Low HP voice"],
  ["death", "DefeatJP", "Japanese Defeat voice"],
  ["move", "MissionStartJP", "Japanese Start Mission voice"]
];

function curl(url, outFile) {
  const flags = ["-sS", "--fail", "-L", "-A", UA, "--retry", "3", "--retry-delay", "2", url];
  if (outFile) {
    execFileSync("curl", [...flags, "-o", outFile], { stdio: ["ignore", "ignore", "inherit"] });
    return undefined;
  }
  return execFileSync("curl", flags, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}

function durationOf(file) {
  return Number.parseFloat(execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file],
    { encoding: "utf8" }
  ).trim());
}

const produced = [];
for (const [slug, prefix] of SHIPS) {
  const dir = path.join(voiceRoot, slug);
  mkdirSync(dir, { recursive: true });
  const json = JSON.parse(curl(
    `${API}?action=query&list=allimages&aiprefix=${encodeURIComponent(`${prefix}_`)}&ailimit=500&format=json`
  ));
  const byName = new Map((json?.query?.allimages ?? []).map((row) => [row.name, row.url]));

  for (const [action, suffix, note] of ACTIONS) {
    const wiki = `${prefix}_${suffix}.ogg`;
    const target = path.join(dir, `${action}.ogg`);
    if (!existsSync(target) || statSync(target).size === 0) {
      const url = byName.get(wiki);
      if (!url) throw new Error(`${wiki} is not on the wiki (${slug}/${action})`);
      const tmp = `${target}.part`;
      curl(url, tmp);
      renameSync(tmp, target);
    }
    produced.push({
      key: `azur-lane/voices/${slug}/${action}`,
      line: `  ${JSON.stringify(`azur-lane/voices/${slug}/${action}`)}: ` +
        `{ "src": "/sounds/azur-lane/voices/${slug}/${action}.ogg", "note": ${JSON.stringify(note)} },`,
      wiki,
      bytes: statSync(target).size,
      seconds: Number(durationOf(target).toFixed(2))
    });
  }
}

// Insert (or replace) the eight lines in alphabetical position: both slugs sort
// before "belfast", the first azur-lane key in the manifest.
const raw = readFileSync(manifestPath, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const lines = raw.split(/\r?\n/).filter((line) => {
  const key = line.match(/^ {2}"([^"]+)"\s*:/)?.[1];
  return !key || !produced.some((entry) => entry.key === key);
});
const anchor = lines.findIndex((line) => /^ {2}"azur-lane\/voices\//.test(line));
if (anchor === -1) throw new Error("no azur-lane/voices block in the manifest");
const block = produced
  .slice()
  .sort((a, b) => a.key.localeCompare(b.key))
  .map((entry) => entry.line);
writeFileSync(manifestPath, [...lines.slice(0, anchor), ...block, ...lines.slice(anchor)].join(eol));
JSON.parse(readFileSync(manifestPath, "utf8"));

for (const entry of produced) {
  console.log(`${entry.key.padEnd(34)} <- ${entry.wiki.padEnd(30)} ${String(entry.bytes).padStart(7)} B  ${entry.seconds}s`);
}
console.log(`\n${produced.length} clips, ${produced.length} manifest entries.`);

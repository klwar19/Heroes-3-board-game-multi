#!/usr/bin/env node

// Rewrites the `blue-archive/voices/*` block of public/sounds/manifest.json from
// the report fetch-blue-archive-voice-variants.mjs writes.
//
// Every BASE key (`blue-archive/voices/<slug>/<action>` — the key
// src/data/unit-sounds.ts resolves) becomes a `random` entry over its variants
// `<action>-1..N`, each of which is a plain src entry. The base key is KEPT so
// the resolver keeps working; the variants are what actually play (the Little
// Busters pattern, src/lib/sound.ts playLibrarySound).
//
// Ibuki's four bespoke commander keys (executive-order, gadabout, sniper-shot,
// up-to-mischief) are single dedicated lines, not per-action pools, and are
// carried through VERBATIM.
//
// Idempotent, and formatting-preserving: the manifest is one entry per line, so
// the block is spliced back in the same one-line-per-entry shape.
//
// Run: node scripts/register-blue-archive-voice-variants.mjs

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "public", "sounds", "manifest.json");
const reportPath = path.join(root, "scripts", "blue-archive-voice-variants.report.json");

const PREFIX = "blue-archive/voices/";
/** Ibuki's dedicated lines: one clip each, kept exactly as they were. */
const BESPOKE = new Set([
  "blue-archive/voices/ibuki/executive-order",
  "blue-archive/voices/ibuki/gadabout",
  "blue-archive/voices/ibuki/sniper-shot",
  "blue-archive/voices/ibuki/up-to-mischief"
]);

const report = JSON.parse(readFileSync(reportPath, "utf8"));
const raw = readFileSync(manifestPath, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const lines = raw.split(/\r?\n/);

// Harvest the values we keep verbatim, and locate the block to replace. Every
// blue-archive entry is one line; the block is contiguous.
const values = new Map();
let first = -1;
let last = -1;
for (let i = 0; i < lines.length; i += 1) {
  const match = lines[i].match(/^ {2}"([^"]+)"\s*:\s*(.*?),?\s*$/);
  if (!match || !match[1].startsWith(PREFIX)) continue;
  if (first === -1) first = i;
  last = i;
  if (BESPOKE.has(match[1])) values.set(match[1], match[2]);
}
if (first === -1) throw new Error(`no ${PREFIX} entries found in ${manifestPath}`);
for (const key of BESPOKE) {
  if (!values.has(key)) throw new Error(`bespoke key vanished from the manifest: ${key}`);
}
const bespokeKept = values.size;

let bases = 0;
let variants = 0;
for (const [slug, info] of Object.entries(report)) {
  const source = `https://bluearchive.wiki/wiki/${info.prefix}/audio`;
  for (const [action, clips] of Object.entries(info.actions)) {
    if (clips.length === 0) continue;
    values.set(`${PREFIX}${slug}/${action}`, JSON.stringify({
      random: clips.map((clip) => `${PREFIX}${slug}/${action}-${clip.variant}`),
      note: `Blue Archive ${info.prefix} — ${clips.length} ${action} ` +
        `${clips.length === 1 ? "variant" : "variants"}, one picked at random`
    }));
    bases += 1;
    for (const clip of clips) {
      values.set(`${PREFIX}${slug}/${action}-${clip.variant}`, JSON.stringify({
        src: `/sounds/${PREFIX}${slug}/${action}-${clip.variant}.ogg`,
        note: `Blue Archive ${info.prefix} — ${clip.wiki}`,
        source
      }));
      variants += 1;
    }
  }
}

const keys = [...values.keys()].sort((a, b) => a.localeCompare(b));
// The block sits at the tail of the manifest (the closing "}" follows it), so the
// LAST line of the block carries no comma — mirror whatever the old block did.
const oldLastHadComma = /,\s*$/.test(lines[last]);
const block = keys.map((key, i) => {
  const comma = i < keys.length - 1 || oldLastHadComma ? "," : "";
  return `  ${JSON.stringify(key)}: ${values.get(key)}${comma}`;
});

writeFileSync(manifestPath, [...lines.slice(0, first), ...block, ...lines.slice(last + 1)].join(eol));

// Fail loudly rather than leaving broken JSON behind.
const parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
const count = Object.keys(parsed).filter((key) => key.startsWith(PREFIX)).length;
if (count !== keys.length) throw new Error(`wrote ${keys.length} keys but parsed ${count} — duplicate key?`);
console.log(`${bases} base pools + ${variants} variants + ${bespokeKept} bespoke = ${keys.length} blue-archive keys.`);

#!/usr/bin/env node
/**
 * Scans public/assets/restia/tachie/*.webp and writes src/restia/data/tachie-index.json:
 * { "<file base>": { "<outfit|default>": ["normal", "happy", ...] } }.
 *
 * File names: <base>[-<outfit>][-<face>].webp, e.g. luna.webp, luna-blush.webp,
 * luna-casual.webp, luna-casual-happy.webp. Faces: see FACES below (must match the
 * Face type in src/restia/engine/types.ts). Anything that is not a face is an outfit.
 * Run after adding or removing portrait files (the Restia art build runs it too).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(ROOT, "public", "assets", "restia", "tachie");
const OUT = path.join(ROOT, "src", "restia", "data", "tachie-index.json");
const FACES = new Set(["happy", "angry", "sad", "surprised", "blush"]);

const index = {};
for (const file of fs.readdirSync(DIR).filter((name) => name.endsWith(".webp")).sort()) {
  const parts = file.replace(/\.webp$/, "").split("-");
  const base = parts.shift();
  const face = parts.length && FACES.has(parts[parts.length - 1]) ? parts.pop() : "normal";
  const outfit = parts.length ? parts.join("-") : "default";
  ((index[base] ??= {})[outfit] ??= []).push(face);
}
fs.writeFileSync(OUT, JSON.stringify(index, null, 1) + "\n");
console.log(`tachie-index: ${Object.keys(index).length} characters -> ${path.relative(ROOT, OUT)}`);

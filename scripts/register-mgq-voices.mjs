#!/usr/bin/env node
/** Register the generated MGQ voice clips without reformatting the large manifest. */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const linesPath = path.join(ROOT, "scripts", "anime-art", "mgq-voice-lines.json");
const manifestPath = path.join(ROOT, "public", "sounds", "manifest.json");
const voicesRoot = path.join(ROOT, "public", "sounds", "mgq", "voices");
const actions = ["attack", "shoot", "defend", "hurt", "death", "move"];
const profiles = JSON.parse(await readFile(linesPath, "utf8")).profiles;

const entries = [];
for (const profile of profiles) {
  for (const action of actions) {
    const key = `mgq/voices/${profile.slug}/${action}`;
    const relative = `${key}.ogg`;
    const absolute = path.join(voicesRoot, profile.slug, `${action}.ogg`);
    const bytes = await readFile(absolute);
    if (bytes.length < 64 || bytes.toString("ascii", 0, 4) !== "OggS") {
      throw new Error(`${relative} is missing or is not an Ogg stream`);
    }
    entries.push([
      key,
      {
        src: `/sounds/${relative}`,
        note: `Original interim Japanese synthetic voice (${profile.displayName}; Microsoft Haruka, not a canonical actor recording)`
      }
    ]);
  }
}
entries.sort(([a], [b]) => a.localeCompare(b));

const original = await readFile(manifestPath, "utf8");
// Generated MGQ entries deliberately stay on one line so this filter is
// idempotent and leaves every pre-existing hand-formatted entry untouched.
const lines = original
  .split(/\r?\n/)
  .filter((line) => !/^\s*"mgq\/voices\//.test(line));
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

for (let index = 0; index < entries.length; index += 1) {
  const [key, value] = entries[index];
  const comma = index === entries.length - 1 ? "" : ",";
  body.push(`  ${JSON.stringify(key)}: ${JSON.stringify(value)}${comma}`);
}
body.push("}", "");
const next = body.join("\n");
JSON.parse(next);
if (next !== original) await writeFile(manifestPath, next);
process.stdout.write(`Registered ${entries.length} MGQ voice clips in public/sounds/manifest.json.\n`);

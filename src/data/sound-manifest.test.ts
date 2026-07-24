import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import soundManifest from "../../public/sounds/manifest.json";

/**
 * Whole-manifest hygiene. The Doom slice added ~110 .wav lumps and ~90 manifest
 * entries (virtual sequences with `sequenceDelayMs`, random death pools, repeat
 * lumps); before it, no test asserted that EVERY manifest entry's file exists on
 * disk or that every `sequence`/`random`/`then` member resolves. A dangling
 * member or a case-mismatched `src` plays fine on case-insensitive Windows but
 * 404s off the case-sensitive R2 CDN — silent in dev, broken in production.
 * These invariants guard the entire media layer, not just Doom.
 */
type Entry = { src?: string; sequence?: string[]; random?: string[]; then?: string };
const library = soundManifest as Record<string, Entry>;
const publicDir = fileURLToPath(new URL("../../public", import.meta.url));

// Case-sensitive existence: membership in the directory's real listing, so a
// manifest `src` whose casing differs from the file is a failure even though
// existsSync() would pass on Windows/macOS.
const dirCache = new Map<string, Set<string>>();
function fileExistsCaseSensitive(src: string): boolean {
  const full = path.join(publicDir, src);
  const dir = path.dirname(full);
  if (!dirCache.has(dir)) {
    dirCache.set(dir, new Set(existsSync(dir) ? readdirSync(dir) : []));
  }
  return dirCache.get(dir)!.has(path.basename(full));
}

describe("sound manifest hygiene", () => {
  it("every entry with a src resolves to a real file on disk (case-sensitive)", () => {
    const missing: string[] = [];
    for (const [key, entry] of Object.entries(library)) {
      if (entry?.src && !fileExistsCaseSensitive(entry.src)) {
        missing.push(`${key} -> ${entry.src}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("every virtual entry declares sequence/random/then members, and every member key exists", () => {
    const dangling: string[] = [];
    const empty: string[] = [];
    for (const [key, entry] of Object.entries(library)) {
      const members = [
        ...(entry?.sequence ?? []),
        ...(entry?.random ?? []),
        ...(typeof entry?.then === "string" ? [entry.then] : [])
      ];
      if (!entry?.src && members.length === 0) {
        empty.push(key);
      }
      for (const member of members) {
        if (!(member in library)) {
          dangling.push(`${key} -> "${member}"`);
        }
      }
    }
    expect(empty, "entries with neither src nor any member would 404").toEqual([]);
    expect(dangling, "sequence/random/then members must be real manifest keys").toEqual([]);
  });

  it("has no duplicate top-level keys (JSON.parse would silently keep the last)", () => {
    // The imported object is already de-duplicated, so scan the raw text: any
    // depth-1 key (indented two spaces) appearing twice is a copy-paste bug that
    // silently drops one entry.
    const raw = readFileSync(path.join(publicDir, "sounds/manifest.json"), "utf8");
    const counts = new Map<string, number>();
    for (const line of raw.split("\n")) {
      const match = line.match(/^ {2}"([^"]+)"\s*:/);
      if (match) {
        counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
      }
    }
    // Sanity: the scan saw every key (guards against a formatting change that
    // would make this test vacuously pass).
    expect(counts.size).toBe(Object.keys(library).length);
    const dupes = [...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k);
    expect(dupes).toEqual([]);
  });
});

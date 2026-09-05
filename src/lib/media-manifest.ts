/**
 * Node-side reader of `media-manifest.json` — the TypeScript twin of
 * scripts/lib/media-manifest.mjs (parity is pinned in media-manifest.test.ts).
 * Imported by next.config.ts, asset-media-version.ts and the test suite ONLY:
 * it uses node:fs and must never reach a client bundle (the browser reads the
 * generated runtime map through asset-url.ts instead).
 *
 * THE CONTRACT (docs/media-manifest.md): binary game media under
 * public/assets|sounds is not tracked in git. The manifest is the truth for
 * which files exist (keyed "assets/ui/x.webp" — the public URL path without
 * its leading slash), each with md5 + byte size (+ width/height for raster
 * images), and the Cloudflare R2 bucket holds the bytes under the
 * CONTENT-ADDRESSED, immutable key "<dir>/<name>.<md5[0:8]>.<ext>".
 *
 * Tests that used to `existsSync(join("public", url))` / `sharp(file)` /
 * `readdirSync(dir)` read the manifest through the helpers below, so they hold
 * on a checkout WITHOUT the media (CI, a fresh clone) and — more importantly —
 * FAIL for a file that exists locally but was never published (the CDN would
 * 404 in production; `npm run media:publish` is the fix).
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const MEDIA_MANIFEST_FILE = "media-manifest.json";
export const MEDIA_RUNTIME_MAP_FILE = "src/lib/media-keys.generated.json";
export const MEDIA_MANIFEST_FORMAT_VERSION = 1;
export const MEDIA_ROOTS = ["assets", "sounds"] as const;
export const MEDIA_EXTENSIONS = ["webp", "png", "jpg", "jpeg", "gif", "svg", "avif", "mp4", "webm", "mp3", "ogg", "wav"] as const;
export const MEDIA_RASTER_EXTENSIONS = ["webp", "png", "jpg", "jpeg", "gif", "avif"] as const;
export const MEDIA_KEY_HASH_LENGTH = 8;

export interface MediaManifestEntry {
  md5: string;
  bytes: number;
  width?: number;
  height?: number;
}

export interface MediaManifest {
  version: number;
  cdn: string;
  roots: string[];
  count: number;
  files: Record<string, MediaManifestEntry>;
}

export interface MediaRuntimeMap {
  version: string;
  hashLength: number;
  dirs: Record<string, Record<string, string>>;
}

export function mediaExtensionOf(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? "" : path.slice(dot + 1).toLowerCase();
}

export function isMediaPath(path: string): boolean {
  return (MEDIA_EXTENSIONS as readonly string[]).includes(mediaExtensionOf(path));
}

/** "/assets/x.webp?v=1" | "assets/x.webp" → "assets/x.webp" */
export function mediaKeyFromUrl(url: string): string {
  return url.split(/[?#]/u)[0].replace(/^\/+/u, "");
}

const manifestCache = new Map<string, MediaManifest | null>();

export function readMediaManifest(rootDir: string = process.cwd()): MediaManifest | null {
  if (manifestCache.has(rootDir)) return manifestCache.get(rootDir)!;
  const file = join(rootDir, MEDIA_MANIFEST_FILE);
  let manifest: MediaManifest | null = null;
  if (existsSync(file)) {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as MediaManifest;
    if (parsed.version !== MEDIA_MANIFEST_FORMAT_VERSION || typeof parsed.files !== "object") {
      throw new Error(`${file}: unsupported media manifest format`);
    }
    manifest = parsed;
  }
  manifestCache.set(rootDir, manifest);
  return manifest;
}

/** Test hook: forget cached manifests (after writing a fixture). */
export function resetMediaManifestCache(): void {
  manifestCache.clear();
}

/** sha1 of every "key:md5" line — the global ?v= version; "" for no media. */
export function mediaManifestVersion(manifest: MediaManifest | null): string {
  if (!manifest) return "";
  const keys = Object.keys(manifest.files).sort();
  if (keys.length === 0) return "";
  return createHash("sha1")
    .update(keys.map((key) => `${key}:${manifest.files[key].md5}`).join("\n"))
    .digest("hex")
    .slice(0, 10);
}

/** "assets/ui/x.webp" + md5 → "assets/ui/x.<md5[0:8]>.webp" (the immutable bucket key). */
export function contentAddressedKey(key: string, md5: string): string {
  const dot = key.lastIndexOf(".");
  const slash = key.lastIndexOf("/");
  const hash = md5.slice(0, MEDIA_KEY_HASH_LENGTH);
  return dot > slash ? `${key.slice(0, dot)}.${hash}${key.slice(dot)}` : `${key}.${hash}`;
}

/** The client map (src/lib/media-keys.generated.json) derived from a manifest. */
export function runtimeMediaMap(manifest: MediaManifest): MediaRuntimeMap {
  const dirs: Record<string, Record<string, string>> = {};
  for (const key of Object.keys(manifest.files).sort()) {
    const slash = key.lastIndexOf("/");
    const dir = key.slice(0, slash);
    (dirs[dir] ??= {})[key.slice(slash + 1)] = manifest.files[key].md5.slice(0, MEDIA_KEY_HASH_LENGTH);
  }
  return { version: mediaManifestVersion(manifest), hashLength: MEDIA_KEY_HASH_LENGTH, dirs };
}

export function mediaFileInfo(url: string, rootDir?: string): MediaManifestEntry | undefined {
  return readMediaManifest(rootDir)?.files[mediaKeyFromUrl(url)];
}

/** Is this public URL path a published media file? */
export function hasMediaFile(url: string, rootDir?: string): boolean {
  return mediaFileInfo(url, rootDir) !== undefined;
}

/** "/assets/x.webp" → "/assets/x.<hash>.webp", or undefined when unpublished. */
export function cdnObjectPath(url: string, rootDir?: string): string | undefined {
  const info = mediaFileInfo(url, rootDir);
  return info ? `/${contentAddressedKey(mediaKeyFromUrl(url), info.md5)}` : undefined;
}

/** Every published file under a directory (recursive), as root-relative URL paths, sorted. */
export function listMediaFiles(dirUrl: string, rootDir?: string): string[] {
  const manifest = readMediaManifest(rootDir);
  if (!manifest) return [];
  const prefix = `${mediaKeyFromUrl(dirUrl).replace(/\/+$/u, "")}/`;
  return Object.keys(manifest.files)
    .filter((key) => key.startsWith(prefix))
    .sort()
    .map((key) => `/${key}`);
}

/** Immediate file names inside a directory (the manifest twin of readdirSync), sorted. */
export function listMediaDir(dirUrl: string, rootDir?: string): string[] {
  const prefix = `${mediaKeyFromUrl(dirUrl).replace(/\/+$/u, "")}/`;
  return listMediaFiles(dirUrl, rootDir)
    .map((url) => url.slice(1 + prefix.length))
    .filter((rest) => !rest.includes("/"));
}

/** Absolute path of the file when it is present on THIS disk, else null (tests needing bytes skip). */
export function localMediaPath(url: string, rootDir: string = process.cwd()): string | null {
  const abs = join(rootDir, "public", mediaKeyFromUrl(url));
  return existsSync(abs) ? abs : null;
}

/** Cheap "was the media pulled?" read: any of the first few manifest entries exists on disk. */
export function hasLocalMediaTree(rootDir: string = process.cwd()): boolean {
  const manifest = readMediaManifest(rootDir);
  if (!manifest) return false;
  const keys = Object.keys(manifest.files);
  if (keys.length === 0) return false;
  const step = Math.max(1, Math.floor(keys.length / 5));
  for (let i = 0; i < keys.length; i += step) {
    if (existsSync(join(rootDir, "public", keys[i]))) return true;
  }
  return false;
}

function walkLocalMedia(publicDir: string): Map<string, number> {
  const local = new Map<string, number>();
  const walk = (absDir: string) => {
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      const abs = join(absDir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile()) {
        const key = relative(publicDir, abs).replaceAll("\\", "/");
        if (isMediaPath(key)) local.set(key, statSync(abs).size);
      }
    }
  };
  for (const root of MEDIA_ROOTS) {
    const dir = join(publicDir, root);
    if (existsSync(dir)) walk(dir);
  }
  return local;
}

export interface LocalTreeReport {
  localCount: number;
  /** present locally, absent from the manifest — never published */
  unpublished: string[];
  /** manifest bytes differ from the local file's size */
  sizeMismatch: string[];
  /** in the manifest, not on this disk */
  missingLocally: string[];
}

/** Stat-only comparison (no hashing) of the local public/ tree against the manifest. */
export function compareLocalTreeToManifest(rootDir: string = process.cwd()): LocalTreeReport {
  const manifest = readMediaManifest(rootDir);
  const local = walkLocalMedia(join(rootDir, "public"));
  const report: LocalTreeReport = { localCount: local.size, unpublished: [], sizeMismatch: [], missingLocally: [] };
  const files = manifest?.files ?? {};
  for (const [key, entry] of Object.entries(files)) {
    const size = local.get(key);
    if (size === undefined) report.missingLocally.push(key);
    else if (size !== entry.bytes) report.sizeMismatch.push(key);
  }
  for (const key of local.keys()) {
    if (!files[key]) report.unpublished.push(key);
  }
  return report;
}

/** Root-relative /assets|/sounds paths referenced by url() in a stylesheet (fonts excluded), unique + sorted. */
export function cssMediaRefs(cssText: string): string[] {
  const refs = new Set<string>();
  for (const match of cssText.matchAll(/url\(\s*(['"]?)(\/(?:assets|sounds)\/[^)'"\s]+)\1\s*\)/gu)) {
    refs.add(match[2].split(/[?#]/u)[0]);
  }
  return [...refs].sort();
}

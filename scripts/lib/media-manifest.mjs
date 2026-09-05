/**
 * Shared media-manifest library for the media CLI (scripts/media.mjs), the
 * Vercel build wrapper (scripts/vercel-build.mjs) and — through the TS twin
 * src/lib/media-manifest.ts — next.config.ts and the test suite.
 *
 * THE CONTRACT (docs/media-manifest.md):
 *   - Binary game media (public/assets/**, public/sounds/**) is NOT tracked in
 *     git. The Cloudflare R2 bucket behind https://cdn.hamthefirt.xyz is the
 *     source of truth for bytes; `media-manifest.json` (repo root, tracked) is
 *     the source of truth for WHICH files exist, keyed by their public URL
 *     path without the leading slash ("assets/ui/x.webp").
 *   - Every entry records the object's md5 (== the R2 ETag of a single-part
 *     upload, so the bucket can be verified with HEAD requests), its byte size
 *     and, for raster images, width/height — so the art-gate tests (dimensions,
 *     stub-size floors, directory listings) run WITHOUT the bytes on disk.
 *   - Objects are CONTENT-ADDRESSED and IMMUTABLE: the bucket key is
 *     "<dir>/<name>.<md5[0:8]>.<ext>" (contentAddressedKey), uploaded with a
 *     one-year immutable Cache-Control and NEVER overwritten or deleted, so a
 *     replaced file is a NEW object (old ones stay for rollback = revert the
 *     manifest commit) and no cache ever goes stale. The browser maps a logical
 *     path to its object through the small generated runtime map
 *     src/lib/media-keys.generated.json (runtimeMediaMap — grouped by
 *     directory, ~50 KB brotli), read by assetUrl(). A path missing from the
 *     map falls back to the logical key + ?v=<mediaVersion> (the pre-2026-09
 *     layout, which the bucket still holds for everything published before).
 *   - JSON / Markdown / text files inside those trees (sound manifest,
 *     durations, READMEs) are CODE: they stay tracked in git and are never
 *     manifest entries. Any OTHER extension is refused so a new media kind is a
 *     conscious addition to MEDIA_EXTENSIONS (and to .gitignore).
 */

import { createHash } from "node:crypto";
import { createReadStream, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
export const MANIFEST_FILE = "media-manifest.json";
export const MANIFEST_FORMAT_VERSION = 1;
export const PRODUCTION_CDN_URL = "https://cdn.hamthefirt.xyz";
/** Trees under public/ whose binaries live on the CDN, not in git. */
export const MEDIA_ROOTS = ["assets", "sounds"];
/** Generated runtime map (tracked, derived from the manifest — keep in lockstep via `media manifest`). */
export const RUNTIME_MAP_FILE = "src/lib/media-keys.generated.json";
/** Hex chars of the md5 embedded in a content-addressed object key. */
export const MEDIA_KEY_HASH_LENGTH = 8;
/** Cache-Control for content-addressed objects: the key changes whenever the bytes do. */
export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
const CONTENT_TYPES = {
  webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  svg: "image/svg+xml", avif: "image/avif", mp4: "video/mp4", webm: "video/webm",
  mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav"
};
export function contentTypeFor(key) {
  return CONTENT_TYPES[extensionOf(key)] ?? "application/octet-stream";
}

/** "assets/ui/x.webp" + md5 -> "assets/ui/x.<md5[0:8]>.webp" (the immutable bucket key). */
export function contentAddressedKey(key, md5) {
  const dot = key.lastIndexOf(".");
  const slash = key.lastIndexOf("/");
  const hash = md5.slice(0, MEDIA_KEY_HASH_LENGTH);
  return dot > slash ? `${key.slice(0, dot)}.${hash}${key.slice(dot)}` : `${key}.${hash}`;
}

/**
 * The client-side map assetUrl() reads: { version, hashLength, dirs: { "<dir>": { "<file>": "<md5[0:8]>" } } }.
 * Grouped by directory because the 5.5k keys share long prefixes (200 KB raw
 * instead of 290 KB flat; ~50 KB brotli on the wire).
 */
export function runtimeMediaMap(manifest) {
  const dirs = {};
  for (const key of Object.keys(manifest.files).sort()) {
    const slash = key.lastIndexOf("/");
    const dir = key.slice(0, slash);
    (dirs[dir] ??= {})[key.slice(slash + 1)] = manifest.files[key].md5.slice(0, MEDIA_KEY_HASH_LENGTH);
  }
  return { version: manifestVersion(manifest), hashLength: MEDIA_KEY_HASH_LENGTH, dirs };
}

export function serializeRuntimeMap(map) {
  const lines = Object.keys(map.dirs).map((dir) => `    ${JSON.stringify(dir)}: ${JSON.stringify(map.dirs[dir])}`);
  return [
    "{",
    `  "version": ${JSON.stringify(map.version)},`,
    `  "hashLength": ${map.hashLength},`,
    `  "dirs": {`,
    lines.join(",\n"),
    "  }",
    "}",
    ""
  ].join("\n");
}

export function writeRuntimeMap(manifest, root = REPO_ROOT) {
  writeFileSync(join(root, RUNTIME_MAP_FILE), serializeRuntimeMap(runtimeMediaMap(manifest)));
}
/** Binary media kinds (keep .gitignore's per-extension list in lockstep). */
export const MEDIA_EXTENSIONS = ["webp", "png", "jpg", "jpeg", "gif", "svg", "avif", "mp4", "webm", "mp3", "ogg", "wav"];
/** Raster kinds whose width/height the manifest records (sharp metadata). */
export const RASTER_EXTENSIONS = ["webp", "png", "jpg", "jpeg", "gif", "avif"];
/** Non-media files allowed inside the media trees (tracked in git, never uploaded). */
export const CODE_EXTENSIONS = ["json", "md", "txt"];

export function extensionOf(path) {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? "" : path.slice(dot + 1).toLowerCase();
}

export function isMediaPath(path) {
  return MEDIA_EXTENSIONS.includes(extensionOf(path));
}

export function manifestPath(root = REPO_ROOT) {
  return join(root, MANIFEST_FILE);
}

/** "/assets/x.webp?v=1" | "assets/x.webp" -> "assets/x.webp" */
export function keyFromUrl(url) {
  return url.split(/[?#]/u)[0].replace(/^\/+/u, "");
}

/** Walk one media tree; returns repo-relative posix keys ("assets/..."). */
export function walkMediaTree(publicDir, root) {
  const dir = join(publicDir, root);
  const media = [];
  const other = [];
  if (!existsSync(dir)) return { media, other };
  const walk = (absDir) => {
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      const abs = join(absDir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.isFile()) {
        const key = relative(publicDir, abs).replaceAll("\\", "/");
        if (isMediaPath(key)) media.push(key);
        else other.push(key);
      }
    }
  };
  walk(dir);
  media.sort();
  other.sort();
  return { media, other };
}

export function md5File(absPath) {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash("md5");
    createReadStream(absPath)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolvePromise(hash.digest("hex")));
  });
}

let sharpModule;
async function imageDimensions(absPath) {
  try {
    sharpModule ??= (await import("sharp")).default;
    const meta = await sharpModule(absPath).metadata();
    if (typeof meta.width === "number" && typeof meta.height === "number") {
      return { width: meta.width, height: meta.height };
    }
  } catch {
    // unreadable image: recorded without dimensions (the size/md5 still pin it)
  }
  return {};
}

/**
 * Build a manifest from the local public/ tree. Reuses entries from `previous`
 * whose size is unchanged AND whose mtime is not newer than the previous
 * manifest file, so a rebuild over 5k files costs stats, not 640 MB of
 * hashing. Pass { rehash: true } to force full hashing.
 */
export async function buildManifestFromTree({
  root = REPO_ROOT,
  previous = null,
  rehash = false,
  onProgress = null,
  concurrency = 8
} = {}) {
  const publicDir = join(root, "public");
  const files = {};
  const unknown = [];
  const keys = [];
  for (const mediaRoot of MEDIA_ROOTS) {
    const { media, other } = walkMediaTree(publicDir, mediaRoot);
    keys.push(...media);
    for (const key of other) {
      if (!CODE_EXTENSIONS.includes(extensionOf(key))) unknown.push(key);
    }
  }
  if (unknown.length > 0) {
    throw new Error(
      `Unrecognised file kind(s) under public/${MEDIA_ROOTS.join("|")} - add the extension to MEDIA_EXTENSIONS (media) or CODE_EXTENSIONS (tracked code) in scripts/lib/media-manifest.mjs, and to .gitignore for media:\n  ${unknown.join("\n  ")}`
    );
  }
  const previousMtime = previous?.__mtimeMs ?? 0;
  let done = 0;
  const queue = [...keys];
  const worker = async () => {
    while (queue.length > 0) {
      const key = queue.shift();
      const abs = join(publicDir, key);
      const stat = statSync(abs);
      const prev = previous?.files?.[key];
      let entry;
      if (!rehash && prev && prev.bytes === stat.size && stat.mtimeMs <= previousMtime) {
        entry = { ...prev };
      } else {
        entry = { md5: await md5File(abs), bytes: stat.size };
        if (RASTER_EXTENSIONS.includes(extensionOf(key))) Object.assign(entry, await imageDimensions(abs));
      }
      files[key] = entry;
      done += 1;
      if (onProgress && done % 250 === 0) onProgress(done, keys.length);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return {
    version: MANIFEST_FORMAT_VERSION,
    cdn: previous?.cdn ?? PRODUCTION_CDN_URL,
    roots: [...MEDIA_ROOTS],
    files: Object.fromEntries(keys.map((key) => [key, files[key]]))
  };
}

/** Deterministic one-entry-per-line JSON so diffs show exactly which files moved. */
export function serializeManifest(manifest) {
  const keys = Object.keys(manifest.files).sort();
  const lines = keys.map((key) => {
    const e = manifest.files[key];
    const dims = e.width !== undefined ? `, "width": ${e.width}, "height": ${e.height}` : "";
    return `    ${JSON.stringify(key)}: { "md5": ${JSON.stringify(e.md5)}, "bytes": ${e.bytes}${dims} }`;
  });
  return [
    "{",
    `  "version": ${manifest.version},`,
    `  "cdn": ${JSON.stringify(manifest.cdn)},`,
    `  "roots": ${JSON.stringify(manifest.roots)},`,
    `  "count": ${keys.length},`,
    `  "files": {`,
    lines.join(",\n"),
    "  }",
    "}",
    ""
  ].join("\n");
}

export function readManifest(root = REPO_ROOT) {
  const file = manifestPath(root);
  if (!existsSync(file)) return null;
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  if (manifest.version !== MANIFEST_FORMAT_VERSION || typeof manifest.files !== "object") {
    throw new Error(`${file}: unsupported manifest format`);
  }
  Object.defineProperty(manifest, "__mtimeMs", { value: statSync(file).mtimeMs, enumerable: false });
  return manifest;
}

export function writeManifest(manifest, root = REPO_ROOT) {
  writeFileSync(manifestPath(root), serializeManifest(manifest));
}

/**
 * The global media version every CDN URL carries as ?v=. A hash of every
 * key+md5, so ANY media change moves it (and a code-only change never does).
 * "" for an empty/missing manifest = unversioned URLs.
 */
export function manifestVersion(manifest) {
  if (!manifest) return "";
  const keys = Object.keys(manifest.files).sort();
  if (keys.length === 0) return "";
  const lines = keys.map((key) => `${key}:${manifest.files[key].md5}`);
  return createHash("sha1").update(lines.join("\n")).digest("hex").slice(0, 10);
}

/** Entries present in `next` but absent or changed in `previous`, and the reverse. */
export function diffManifests(previous, next) {
  const added = [];
  const changed = [];
  const removed = [];
  const prevFiles = previous?.files ?? {};
  for (const [key, entry] of Object.entries(next.files)) {
    const prev = prevFiles[key];
    if (!prev) added.push(key);
    else if (prev.md5 !== entry.md5 || prev.bytes !== entry.bytes) changed.push(key);
  }
  for (const key of Object.keys(prevFiles)) {
    if (!next.files[key]) removed.push(key);
  }
  return { added, changed, removed };
}

/** Cheap "is the local tree what the manifest says" read (stat only, no hashing). */
export function compareTreeToManifest(manifest, root = REPO_ROOT) {
  const publicDir = join(root, "public");
  const local = new Map();
  for (const mediaRoot of MEDIA_ROOTS) {
    for (const key of walkMediaTree(publicDir, mediaRoot).media) {
      local.set(key, statSync(join(publicDir, key)).size);
    }
  }
  const unpublished = [];
  const sizeMismatch = [];
  const missingLocally = [];
  for (const [key, entry] of Object.entries(manifest.files)) {
    const size = local.get(key);
    if (size === undefined) missingLocally.push(key);
    else if (size !== entry.bytes) sizeMismatch.push(key);
  }
  for (const key of local.keys()) {
    if (!manifest.files[key]) unpublished.push(key);
  }
  return { localCount: local.size, unpublished, sizeMismatch, missingLocally };
}

/** Minimal .env.local loader (KEY=VALUE, optional quotes, # comments). Never overrides a set var. */
export function loadEnvLocal(root = REPO_ROOT, env = process.env) {
  const file = join(root, ".env.local");
  if (!existsSync(file)) return [];
  const loaded = [];
  for (const rawLine of readFileSync(file, "utf8").split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/u, "");
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in env)) {
      env[key] = value;
      loaded.push(key);
    }
  }
  return loaded;
}

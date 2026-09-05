/**
 * Shared media-manifest library for the media CLI (scripts/media.mjs), the
 * Vercel build wrapper (scripts/vercel-build.mjs) and — through the TS twin
 * src/lib/media-manifest.ts — next.config.ts and the test suite.
 *
 * THE CONTRACT (docs/media-manifest.md) — TWO FAMILIES, one mechanism:
 *   - MEDIA: binary game media (public/assets/**, public/sounds/**) served to
 *     players. NOT tracked in git. `media-manifest.json` (repo root) is the
 *     source of truth for WHICH files exist, keyed by the public URL path
 *     without the leading slash ("assets/ui/x.webp"); the browser maps a
 *     logical path to its object through the generated runtime map
 *     src/lib/media-keys.generated.json (runtimeMediaMap, ~50 KB brotli).
 *   - SOURCES: the art-pipeline MASTERS (scripts/anime-art, scripts/*-art,
 *     generated-session-art, assets-to-translate — raw renders, PSD-grade PNGs,
 *     review sheets). Build inputs, never served. NOT tracked in git either;
 *     `sources-manifest.json` lists them keyed by repo-relative path, objects
 *     live under the `sources/` prefix, and there is NO runtime map. Only the
 *     raster/audio/video kinds move; the SVG/JSON/MD/MJS beside them stay code.
 *   - Every entry records md5 (== the R2 ETag of a single-part upload), byte
 *     size and, for raster images, width/height — so existence / dimension /
 *     size / listing tests run WITHOUT the bytes on disk.
 *   - Objects are CONTENT-ADDRESSED and IMMUTABLE: "<prefix><dir>/<name>.<md5[0:8]>.<ext>"
 *     (contentAddressedKey), one-year immutable Cache-Control, NEVER overwritten
 *     or deleted — a replaced file is a NEW object, rollback = revert the
 *     manifest commit. A media path missing from the runtime map falls back to
 *     the logical key + ?v=<mediaVersion> (the pre-2026-09 layout).
 *   - Inside the MEDIA trees any extension that is neither media nor code
 *     (json/md/txt) is refused, so a new kind is a conscious addition to
 *     MEDIA_EXTENSIONS (and .gitignore). The SOURCE trees are looser: anything
 *     not in SOURCE_EXTENSIONS simply stays tracked.
 */

import { createHash } from "node:crypto";
import { createReadStream, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
export const MANIFEST_FILE = "media-manifest.json";
export const SOURCES_MANIFEST_FILE = "sources-manifest.json";
export const MANIFEST_FORMAT_VERSION = 1;
export const PRODUCTION_CDN_URL = "https://cdn.hamthefirt.xyz";
/** Trees under public/ whose binaries live on the CDN, not in git. */
export const MEDIA_ROOTS = ["assets", "sounds"];
/** Repo-relative art-master trees whose binaries live in the bucket under sources/, not in git. */
export const SOURCE_ROOTS = [
  "scripts/anime-art",
  "scripts/commander-art",
  "scripts/neutral-unit-art",
  "scripts/doom-art",
  "generated-session-art",
  "assets-to-translate"
];
/** Generated runtime map (tracked, derived from the media manifest — keep in lockstep via `media manifest`). */
export const RUNTIME_MAP_FILE = "src/lib/media-keys.generated.json";
/** Hex chars of the md5 embedded in a content-addressed object key. */
export const MEDIA_KEY_HASH_LENGTH = 8;
/** Cache-Control for content-addressed objects: the key changes whenever the bytes do. */
export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
/** Binary media kinds (keep .gitignore's per-extension list in lockstep). */
export const MEDIA_EXTENSIONS = ["webp", "png", "jpg", "jpeg", "gif", "svg", "avif", "mp4", "webm", "mp3", "ogg", "wav"];
/** Binary master kinds under the SOURCE_ROOTS (svg stays tracked there: editable vectors are code). */
export const SOURCE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "psd", "tif", "tiff", "bmp", "avif", "mp3", "wav", "ogg", "mp4", "mov", "bik"];
/** Raster kinds whose width/height the manifest records (sharp metadata). */
export const RASTER_EXTENSIONS = ["webp", "png", "jpg", "jpeg", "gif", "avif", "tif", "tiff", "bmp"];
/** Non-media files allowed inside the MEDIA trees (tracked in git, never uploaded). */
export const CODE_EXTENSIONS = ["json", "md", "txt"];

const CONTENT_TYPES = {
  webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  svg: "image/svg+xml", avif: "image/avif", tif: "image/tiff", tiff: "image/tiff", bmp: "image/bmp",
  psd: "image/vnd.adobe.photoshop", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  bik: "application/octet-stream", mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav"
};

/**
 * The two families. `baseDir` is where the roots live relative to the repo
 * root ("" = the repo root itself); manifest keys are paths relative to it.
 */
export const FAMILIES = {
  media: {
    name: "media",
    manifestFile: MANIFEST_FILE,
    baseDir: "public",
    roots: MEDIA_ROOTS,
    extensions: MEDIA_EXTENSIONS,
    /** null = any other extension is simply code and stays tracked */
    codeExtensions: CODE_EXTENSIONS,
    objectPrefix: "",
    runtimeMap: true
  },
  sources: {
    name: "sources",
    manifestFile: SOURCES_MANIFEST_FILE,
    baseDir: "",
    roots: SOURCE_ROOTS,
    extensions: SOURCE_EXTENSIONS,
    codeExtensions: null,
    objectPrefix: "sources/",
    runtimeMap: false
  }
};

export function extensionOf(path) {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? "" : path.slice(dot + 1).toLowerCase();
}

export function isMediaPath(path, extensions = MEDIA_EXTENSIONS) {
  return extensions.includes(extensionOf(path));
}

export function contentTypeFor(key) {
  return CONTENT_TYPES[extensionOf(key)] ?? "application/octet-stream";
}

export function manifestPath(root = REPO_ROOT, family = FAMILIES.media) {
  return join(root, family.manifestFile);
}

export function familyBaseDir(root = REPO_ROOT, family = FAMILIES.media) {
  return family.baseDir ? join(root, family.baseDir) : root;
}

/** "/assets/x.webp?v=1" | "assets/x.webp" -> "assets/x.webp" */
export function keyFromUrl(url) {
  return url.split(/[?#]/u)[0].replace(/^\/+/u, "").replaceAll("\\", "/");
}

/** "assets/ui/x.webp" + md5 -> "assets/ui/x.<md5[0:8]>.webp" (the immutable bucket key, before any family prefix). */
export function contentAddressedKey(key, md5) {
  const dot = key.lastIndexOf(".");
  const slash = key.lastIndexOf("/");
  const hash = md5.slice(0, MEDIA_KEY_HASH_LENGTH);
  return dot > slash ? `${key.slice(0, dot)}.${hash}${key.slice(dot)}` : `${key}.${hash}`;
}

/** The bucket key of a manifest entry, family prefix included ("sources/scripts/anime-art/x.<hash>.png"). */
export function objectKeyFor(family, key, md5) {
  return `${family.objectPrefix}${contentAddressedKey(key, md5)}`;
}

/** Walk one tree; returns base-relative posix keys split into media vs. other files. */
export function walkMediaTree(baseDir, root, extensions = MEDIA_EXTENSIONS) {
  const dir = join(baseDir, root);
  const media = [];
  const other = [];
  if (!existsSync(dir)) return { media, other };
  const walk = (absDir) => {
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      const abs = join(absDir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.isFile()) {
        const key = relative(baseDir, abs).replaceAll("\\", "/");
        if (isMediaPath(key, extensions)) media.push(key);
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
 * Build a manifest from the local tree of one family. Reuses entries from
 * `previous` whose size is unchanged AND whose mtime is not newer than the
 * previous manifest file, so a rebuild over 5k files costs stats, not hashing.
 * Pass { rehash: true } to force full hashing.
 */
export async function buildManifestFromTree({
  root = REPO_ROOT,
  family = FAMILIES.media,
  previous = null,
  rehash = false,
  onProgress = null,
  concurrency = 8
} = {}) {
  const baseDir = familyBaseDir(root, family);
  const files = {};
  const unknown = [];
  const keys = [];
  for (const treeRoot of family.roots) {
    const { media, other } = walkMediaTree(baseDir, treeRoot, family.extensions);
    keys.push(...media);
    if (family.codeExtensions) {
      for (const key of other) {
        if (!family.codeExtensions.includes(extensionOf(key))) unknown.push(key);
      }
    }
  }
  if (unknown.length > 0) {
    throw new Error(
      `Unrecognised file kind(s) under ${family.baseDir}/${family.roots.join("|")} - add the extension to MEDIA_EXTENSIONS (media) or CODE_EXTENSIONS (tracked code) in scripts/lib/media-manifest.mjs, and to .gitignore for media:\n  ${unknown.join("\n  ")}`
    );
  }
  const previousMtime = previous?.__mtimeMs ?? 0;
  let done = 0;
  const queue = [...keys];
  const worker = async () => {
    while (queue.length > 0) {
      const key = queue.shift();
      const abs = join(baseDir, key);
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
    family: family.name,
    cdn: previous?.cdn ?? PRODUCTION_CDN_URL,
    roots: [...family.roots],
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
    ...(manifest.family && manifest.family !== "media" ? [`  "family": ${JSON.stringify(manifest.family)},`] : []),
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

export function readManifest(root = REPO_ROOT, family = FAMILIES.media) {
  const file = manifestPath(root, family);
  if (!existsSync(file)) return null;
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  if (manifest.version !== MANIFEST_FORMAT_VERSION || typeof manifest.files !== "object") {
    throw new Error(`${file}: unsupported manifest format`);
  }
  Object.defineProperty(manifest, "__mtimeMs", { value: statSync(file).mtimeMs, enumerable: false });
  return manifest;
}

export function writeManifest(manifest, root = REPO_ROOT, family = FAMILIES.media) {
  writeFileSync(manifestPath(root, family), serializeManifest(manifest));
}

/**
 * The global media version every legacy CDN URL carries as ?v=. A hash of
 * every key+md5, so ANY media change moves it (and a code-only change never
 * does). "" for an empty/missing manifest = unversioned URLs.
 */
export function manifestVersion(manifest) {
  if (!manifest) return "";
  const keys = Object.keys(manifest.files).sort();
  if (keys.length === 0) return "";
  const lines = keys.map((key) => `${key}:${manifest.files[key].md5}`);
  return createHash("sha1").update(lines.join("\n")).digest("hex").slice(0, 10);
}

/**
 * The client-side map assetUrl() reads: { version, hashLength, dirs: { "<dir>": { "<file>": "<md5[0:8]>" } } }.
 * Grouped by directory because the 5.5k keys share long prefixes (200 KB raw
 * instead of 290 KB flat; ~50 KB brotli on the wire). MEDIA family only.
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
export function compareTreeToManifest(manifest, root = REPO_ROOT, family = FAMILIES.media) {
  const baseDir = familyBaseDir(root, family);
  const local = new Map();
  for (const treeRoot of family.roots) {
    for (const key of walkMediaTree(baseDir, treeRoot, family.extensions).media) {
      local.set(key, statSync(join(baseDir, key)).size);
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

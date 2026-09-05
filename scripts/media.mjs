#!/usr/bin/env node
/**
 * Media CLI — the ONE way binary game media moves between a developer machine,
 * the Cloudflare R2 bucket and the two tracked files that describe it
 * (`media-manifest.json`, `src/lib/media-keys.generated.json`). Contract:
 * docs/media-manifest.md; shared library: scripts/lib/media-manifest.mjs.
 *
 *   node scripts/media.mjs status                 local tree vs manifest (unpublished / stale / missing)
 *   node scripts/media.mjs manifest [--rehash]    rebuild the manifest + runtime map from public/ (NO upload;
 *                                                  use it only to inspect — publish is what ships files)
 *   node scripts/media.mjs publish [--dry-run] [--all] [--rehash]
 *                                                  hash public/, upload every new/changed file to its
 *                                                  content-addressed key, verify each object in the bucket,
 *                                                  then write manifest + runtime map (needs .env.local R2_*).
 *                                                  --all also (re)uploads any manifest object the bucket lacks.
 *   node scripts/media.mjs pull [--prune] [--concurrency N]
 *                                                  download every manifest entry missing/mismatched locally
 *                                                  from the CDN (no credentials; fresh clones, CI)
 *   node scripts/media.mjs verify [--sample N]     HEAD every (or N sampled + critical) object on the CDN
 *                                                  and compare size + ETag(md5) — the scheduled smoke test
 *
 * Credentials come from .env.local (loaded here — npm never loads it):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY; optional R2_BUCKET
 *   (default heroes3), R2_ENDPOINT. Uploads are plain SigV4 PutObject calls
 *   (node fetch, no rclone / SDK): single-part, Content-MD5 checked by R2, so
 *   the object's ETag IS the md5 the manifest records.
 *
 * Safety: publish never deletes or overwrites a bucket object (a changed file
 * is a NEW key), never writes the manifest unless every uploaded object
 * verified in the bucket, and refuses an unknown file kind.
 */

import { createHash, createHmac } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  IMMUTABLE_CACHE_CONTROL,
  MANIFEST_FILE,
  MEDIA_ROOTS,
  REPO_ROOT,
  RUNTIME_MAP_FILE,
  buildManifestFromTree,
  compareTreeToManifest,
  contentAddressedKey,
  contentTypeFor,
  diffManifests,
  loadEnvLocal,
  manifestVersion,
  readManifest,
  walkMediaTree,
  writeManifest,
  writeRuntimeMap
} from "./lib/media-manifest.mjs";

const args = process.argv.slice(2);
const command = args[0];
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 || index + 1 >= args.length ? fallback : args[index + 1];
};

/** Keys whose absence would blank a whole screen; always part of a sampled verify. */
const CRITICAL_KEYS = [
  "assets/ui/menu/main-menu-loop.mp4",
  "assets/ui/ornate/banner-command.webp",
  "assets/ui/ornate/button-plate.webp",
  "assets/ui/ornate/button-plate-gold.webp"
];

function log(message) {
  process.stdout.write(`${message}\n`);
}

function fail(message) {
  process.stderr.write(`error: ${message}\n`);
  process.exit(1);
}

function objectKeyOf(manifest, key) {
  return contentAddressedKey(key, manifest.files[key].md5);
}

function cdnObjectUrl(manifest, key, query = "") {
  return `${manifest.cdn.replace(/\/+$/u, "")}/${objectKeyOf(manifest, key)}${query}`;
}

async function mapConcurrent(items, concurrency, worker) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, async () => {
      while (queue.length > 0) await worker(queue.shift());
    })
  );
}

async function fetchWithRetry(url, init, attempts = 4) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url, init);
      if (response.status < 500) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((r) => setTimeout(r, 600 * (i + 1)));
  }
  throw lastError;
}

function etagOf(response) {
  return (response.headers.get("etag") ?? "").replace(/^W\//u, "").replaceAll('"', "");
}

/**
 * Compare a HEAD response with a manifest entry. Cloudflare compresses text-like
 * types (svg) on the fly, so such a HEAD may carry no Content-Length and a weak
 * ETag; we ask for identity encoding, and when the length is still absent the
 * (strong-stripped) ETag alone must match the md5.
 */
function headMismatch(response, entry) {
  if (response.status !== 200) return `HTTP ${response.status}`;
  const lengthHeader = response.headers.get("content-length");
  const length = lengthHeader === null ? null : Number(lengthHeader);
  const etag = etagOf(response);
  if (length !== null && length !== entry.bytes) return `size ${length} != manifest ${entry.bytes}`;
  if (etag && etag !== entry.md5) return `etag ${etag} != manifest md5 ${entry.md5}`;
  if (length === null && !etag) return "no content-length and no etag to compare";
  return null;
}

const IDENTITY_HEAD = { method: "HEAD", headers: { "accept-encoding": "identity" } };

// ---------------------------------------------------------------------------
// R2 (S3 API) — SigV4 signing for HEAD/PUT of one object, path-style URLs.
// ---------------------------------------------------------------------------

function sha256hex(data) {
  return createHash("sha256").update(data).digest("hex");
}
function hmac(key, data) {
  return createHmac("sha256", key).update(data).digest();
}
/** RFC 3986 encoding of one path segment (AWS canonical form). */
function encodeSegment(segment) {
  return encodeURIComponent(segment).replace(/[!'()*]/gu, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function r2Client() {
  const loaded = loadEnvLocal();
  if (loaded.length > 0) log(`Loaded ${loaded.length} variable(s) from .env.local: ${loaded.join(", ")}`);
  for (const name of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]) {
    if (!process.env[name]) fail(`${name} is not set (put it in .env.local — see the header of scripts/media.mjs)`);
  }
  const bucket = process.env.R2_BUCKET || "heroes3";
  const endpoint = (process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`).replace(/\/+$/u, "");
  const host = new URL(endpoint).host;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secret = process.env.R2_SECRET_ACCESS_KEY;

  function signed(method, objectKey, body, extraHeaders = {}) {
    const canonicalPath = `/${encodeSegment(bucket)}/${objectKey.split("/").map(encodeSegment).join("/")}`;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/gu, "");
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = sha256hex(body ?? "");
    const headers = {
      host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      ...Object.fromEntries(Object.entries(extraHeaders).map(([k, v]) => [k.toLowerCase(), String(v).trim()]))
    };
    const names = Object.keys(headers).sort();
    const canonicalRequest = [
      method,
      canonicalPath,
      "",
      names.map((h) => `${h}:${headers[h]}\n`).join(""),
      names.join(";"),
      payloadHash
    ].join("\n");
    const scope = `${dateStamp}/auto/s3/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256hex(canonicalRequest)].join("\n");
    const kSigning = hmac(hmac(hmac(hmac(`AWS4${secret}`, dateStamp), "auto"), "s3"), "aws4_request");
    const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");
    // fetch sets Host itself; everything else we signed goes on the wire.
    const sendHeaders = Object.fromEntries(Object.entries(headers).filter(([name]) => name !== "host"));
    return {
      url: `${endpoint}${canonicalPath}`,
      headers: {
        ...sendHeaders,
        authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`
      }
    };
  }

  return {
    bucket,
    /** null when absent; { etag, bytes } when present. */
    async head(objectKey) {
      const { url, headers } = signed("HEAD", objectKey, "");
      const response = await fetchWithRetry(url, { method: "HEAD", headers: { ...headers, "accept-encoding": "identity" } });
      if (response.status === 404) return null;
      if (response.status !== 200) throw new Error(`HEAD ${objectKey}: HTTP ${response.status}`);
      return { etag: etagOf(response), mismatch: (entry) => headMismatch(response, entry) };
    },
    async put(objectKey, body, contentType) {
      const { url, headers } = signed("PUT", objectKey, body, {
        "content-type": contentType,
        "cache-control": IMMUTABLE_CACHE_CONTROL,
        "content-md5": createHash("md5").update(body).digest("base64"),
        "content-length": String(body.length)
      });
      const response = await fetchWithRetry(url, { method: "PUT", headers, body });
      if (response.status !== 200) {
        throw new Error(`PUT ${objectKey}: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
      }
      return etagOf(response);
    }
  };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function buildNext(previous) {
  log("Hashing the local media tree…");
  return buildManifestFromTree({
    previous,
    rehash: flag("rehash"),
    onProgress: (done, total) => log(`  hashed ${done}/${total}…`)
  });
}

function writeOutputs(next) {
  writeManifest(next);
  writeRuntimeMap(next);
}

async function commandManifest() {
  const previous = readManifest();
  const next = await buildNext(previous);
  const { added, changed, removed } = diffManifests(previous, next);
  writeOutputs(next);
  log(
    `Wrote ${MANIFEST_FILE} + ${RUNTIME_MAP_FILE}: ${Object.keys(next.files).length} files, version ${manifestVersion(next)} (+${added.length} added, ~${changed.length} changed, -${removed.length} removed vs the previous manifest).`
  );
  if (added.length + changed.length > 0) {
    log("WARNING: `manifest` records the local tree WITHOUT uploading. The CDN does not serve these files until `npm run media:publish` runs — do not commit a manifest produced this way.");
  }
}

function commandStatus() {
  const manifest = readManifest();
  if (!manifest) fail(`${MANIFEST_FILE} is missing.`);
  const report = compareTreeToManifest(manifest);
  log(`Manifest: ${Object.keys(manifest.files).length} files, version ${manifestVersion(manifest)}, CDN ${manifest.cdn}`);
  log(`Local:    ${report.localCount} media file(s) under public/${MEDIA_ROOTS.join("|")}`);
  const show = (label, list) => {
    if (list.length === 0) return;
    log(`${label} (${list.length}):`);
    for (const key of list.slice(0, 40)) log(`  ${key}`);
    if (list.length > 40) log(`  … and ${list.length - 40} more`);
  };
  show("UNPUBLISHED — present locally, not in the manifest (run `npm run media:publish`)", report.unpublished);
  show("SIZE MISMATCH — local bytes differ from the manifest (media:publish to ship them, media:pull to restore)", report.sizeMismatch);
  show("MISSING LOCALLY — in the manifest, not on this disk (run `npm run media:pull`)", report.missingLocally);
  if (report.unpublished.length + report.sizeMismatch.length + report.missingLocally.length === 0) {
    log("Local media tree matches the manifest.");
  } else {
    process.exitCode = 1;
  }
}

async function commandPublish() {
  const dryRun = flag("dry-run");
  const all = flag("all");
  const r2 = r2Client();
  const previous = readManifest();
  const next = await buildNext(previous);
  const { added, changed, removed } = diffManifests(previous, next);
  log(`Local tree: ${Object.keys(next.files).length} files; +${added.length} new, ~${changed.length} changed, -${removed.length} gone since the manifest.`);
  if (removed.length > 0) {
    log(`NOTE: ${removed.length} manifest entr${removed.length === 1 ? "y is" : "ies are"} not on this disk and LEAVE the manifest (objects stay in the bucket). A stale local tree? Ctrl-C and run \`npm run media:pull\` first.`);
    for (const key of removed.slice(0, 20)) log(`  - ${key}`);
  }
  const candidates = all ? Object.keys(next.files) : [...added, ...changed];

  // Which candidate objects does the bucket already hold (idempotent re-run)?
  const toUpload = [];
  const bad = [];
  let probed = 0;
  await mapConcurrent(candidates, 16, async (key) => {
    const objectKey = objectKeyOf(next, key);
    const existing = await r2.head(objectKey);
    if (!existing) toUpload.push(key);
    else if (existing.etag && existing.etag !== next.files[key].md5) bad.push(`${objectKey}: bucket etag ${existing.etag} != local md5 ${next.files[key].md5}`);
    probed += 1;
    if (probed % 500 === 0) log(`  probed ${probed}/${candidates.length} object(s)…`);
  });
  if (bad.length > 0) {
    for (const line of bad.slice(0, 20)) log(`  ✗ ${line}`);
    fail(`${bad.length} content-addressed object(s) exist with DIFFERENT bytes — an md5-prefix collision or a corrupted upload; refusing to continue.`);
  }
  log(`${toUpload.length} object(s) to upload (${candidates.length - toUpload.length} already in the bucket).`);
  if (toUpload.length === 0) {
    if (!dryRun && (previous === null || diffManifests(previous, next).removed.length > 0 || added.length + changed.length > 0)) {
      writeOutputs(next);
      log(`Wrote ${MANIFEST_FILE} + ${RUNTIME_MAP_FILE} (version ${manifestVersion(next)}).`);
    } else {
      log("Nothing to do.");
    }
    return;
  }
  if (dryRun) {
    for (const key of toUpload.slice(0, 50)) log(`  would upload ${objectKeyOf(next, key)} (${next.files[key].bytes} bytes)`);
    if (toUpload.length > 50) log(`  … and ${toUpload.length - 50} more`);
    log("Dry run: nothing uploaded, manifest untouched.");
    return;
  }

  const publicDir = join(REPO_ROOT, "public");
  const totalBytes = toUpload.reduce((sum, key) => sum + next.files[key].bytes, 0);
  log(`Uploading ${toUpload.length} object(s), ${(totalBytes / 1e6).toFixed(1)} MB, to r2:${r2.bucket}…`);
  const failures = [];
  let done = 0;
  let sent = 0;
  await mapConcurrent(toUpload, Number(option("concurrency", "12")), async (key) => {
    const objectKey = objectKeyOf(next, key);
    try {
      const body = readFileSync(join(publicDir, key));
      const md5 = createHash("md5").update(body).digest("hex");
      if (md5 !== next.files[key].md5) throw new Error("file changed while publishing");
      const etag = await r2.put(objectKey, body, contentTypeFor(key));
      if (etag && etag !== md5) throw new Error(`bucket etag ${etag} != md5 ${md5}`);
      sent += body.length;
    } catch (error) {
      failures.push(`${objectKey}: ${error.message}`);
    }
    done += 1;
    if (done % 200 === 0) log(`  uploaded ${done}/${toUpload.length} (${(sent / 1e6).toFixed(0)} MB)…`);
  });
  if (failures.length > 0) {
    for (const line of failures.slice(0, 50)) log(`  ✗ ${line}`);
    fail(`${failures.length} upload(s) failed — manifest NOT written; re-run publish (already-uploaded objects are skipped).`);
  }

  log(`Verifying ${toUpload.length} object(s) in the bucket…`);
  const problems = [];
  await mapConcurrent(toUpload, 16, async (key) => {
    const objectKey = objectKeyOf(next, key);
    const head = await r2.head(objectKey).catch((error) => ({ error }));
    if (!head) problems.push(`${objectKey}: missing after upload`);
    else if (head.error) problems.push(`${objectKey}: ${head.error.message}`);
    else {
      const mismatch = head.mismatch(next.files[key]);
      if (mismatch) problems.push(`${objectKey}: ${mismatch}`);
    }
  });
  if (problems.length > 0) {
    for (const line of problems.slice(0, 50)) log(`  ✗ ${line}`);
    fail(`${problems.length} object(s) did not verify — manifest NOT written; re-run publish.`);
  }
  writeOutputs(next);
  log(
    `Published ${toUpload.length} object(s); wrote ${MANIFEST_FILE} + ${RUNTIME_MAP_FILE} (version ${manifestVersion(next)}). Commit both files — the next deploy serves the new art.`
  );
}

async function commandPull() {
  const manifest = readManifest();
  if (!manifest) fail(`${MANIFEST_FILE} is missing.`);
  const concurrency = Number(option("concurrency", "12"));
  const publicDir = join(REPO_ROOT, "public");
  const report = compareTreeToManifest(manifest);
  const wanted = [...report.missingLocally, ...report.sizeMismatch];
  log(`Manifest ${Object.keys(manifest.files).length} files; ${wanted.length} to download (${report.missingLocally.length} missing, ${report.sizeMismatch.length} size-mismatched).`);
  const failures = [];
  let done = 0;
  await mapConcurrent(wanted, concurrency, async (key) => {
    const entry = manifest.files[key];
    const target = join(publicDir, key);
    const tmp = `${target}.part`;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        // Immutable object: no cache-bust needed; a retry adds one so a
        // transiently cached error response is not replayed.
        const response = await fetch(cdnObjectUrl(manifest, key, attempt > 1 ? `?retry=${attempt}` : ""));
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        const md5 = createHash("md5").update(bytes).digest("hex");
        if (md5 !== entry.md5) throw new Error(`md5 ${md5} != manifest ${entry.md5}`);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(tmp, bytes);
        renameSync(tmp, target);
        break;
      } catch (error) {
        if (existsSync(tmp)) unlinkSync(tmp);
        if (attempt === 3) failures.push(`${key}: ${error.message}`);
        else await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
    done += 1;
    if (done % 250 === 0) log(`  downloaded ${done}/${wanted.length}…`);
  });
  if (flag("prune")) {
    for (const key of report.unpublished) {
      unlinkSync(join(publicDir, key));
      log(`  pruned unpublished local file ${key}`);
    }
  } else if (report.unpublished.length > 0) {
    log(`${report.unpublished.length} local file(s) are not in the manifest (kept; --prune deletes them): ${report.unpublished.slice(0, 5).join(", ")}${report.unpublished.length > 5 ? ", …" : ""}`);
  }
  if (failures.length > 0) {
    for (const failure of failures) log(`  ✗ ${failure}`);
    fail(`${failures.length} file(s) failed to download.`);
  }
  log(`Pulled ${wanted.length} file(s); local tree matches ${MANIFEST_FILE}.`);
}

async function commandVerify() {
  const manifest = readManifest();
  if (!manifest) fail(`${MANIFEST_FILE} is missing.`);
  const allKeys = Object.keys(manifest.files);
  let keys = allKeys;
  const sample = Number(option("sample", "0"));
  if (sample > 0 && sample < allKeys.length) {
    // Day-seeded shuffle: a scheduled run walks a different slice each day
    // while staying reproducible within the day.
    const seed = createHash("sha1").update(new Date().toISOString().slice(0, 10)).digest();
    const scored = allKeys.map((key) => [createHash("sha1").update(seed).update(key).digest().readUInt32BE(0), key]);
    scored.sort((a, b) => a[0] - b[0]);
    keys = [...new Set([...CRITICAL_KEYS.filter((key) => manifest.files[key]), ...scored.slice(0, sample).map((s) => s[1])])];
  }
  log(`Verifying ${keys.length} of ${allKeys.length} object(s) on ${manifest.cdn}…`);
  const problems = [];
  let checked = 0;
  await mapConcurrent(keys, 16, async (key) => {
    const entry = manifest.files[key];
    try {
      const response = await fetchWithRetry(cdnObjectUrl(manifest, key), IDENTITY_HEAD);
      const mismatch = headMismatch(response, entry);
      if (mismatch) problems.push(`${objectKeyOf(manifest, key)}: ${mismatch}`);
    } catch (error) {
      problems.push(`${key}: ${error.message}`);
    }
    checked += 1;
    if (checked % 500 === 0) log(`  verified ${checked}/${keys.length}…`);
  });
  if (problems.length > 0) {
    for (const problem of problems) log(`  ✗ ${problem}`);
    fail(`${problems.length} object(s) failed verification.`);
  }
  log(`All ${keys.length} object(s) verified (HTTP 200, size and ETag match the manifest).`);
}

function commandTree() {
  const publicDir = join(REPO_ROOT, "public");
  for (const root of MEDIA_ROOTS) {
    const { media, other } = walkMediaTree(publicDir, root);
    log(`public/${root}: ${media.length} media file(s), ${other.length} tracked code/doc file(s)`);
  }
}

switch (command) {
  case "manifest":
    await commandManifest();
    break;
  case "status":
    commandStatus();
    break;
  case "publish":
    await commandPublish();
    break;
  case "pull":
    await commandPull();
    break;
  case "verify":
    await commandVerify();
    break;
  case "tree":
    commandTree();
    break;
  default:
    fail(`unknown command "${command ?? ""}" — see the header of scripts/media.mjs`);
}

/**
 * Production Vercel build wrapper.
 *
 * Game media is served from Cloudflare R2, but Next/Vercel would otherwise
 * package the same hundreds of MB from public/ into every deployment. On a
 * real Vercel build only, this script:
 *   1. verifies that the build resolves media to the CDN;
 *   2. computes the existing global cache-busting version while all media is
 *      still present;
 *   3. stages CDN-only binaries under .vercel/.media-staging (which Vercel never
 *      deploys), retaining the JSON sound manifests imported by application
 *      code; and
 *   4. runs Next with the precomputed version.
 *
 * The repository, Git history, GitHub R2 sync, PartyKit deployment, and normal
 * local `npm run build` are untouched. A failed Next build restores everything
 * before exiting. Successful Vercel builds intentionally leave the files in
 * the ignored staging area because the build workspace is ephemeral.
 */

import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const ROOT = resolve(import.meta.dirname, "..");
const PUBLIC = join(ROOT, "public");
const STAGING = join(ROOT, ".vercel", ".media-staging");
const MEDIA_DIRS = [join(PUBLIC, "assets"), join(PUBLIC, "sounds")];
const SOUND_METADATA = ["manifest.json", "durations.json"];
const require = createRequire(import.meta.url);

function walk(dir, lines) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(absolute, lines);
    } else if (entry.isFile()) {
      const path = relative(ROOT, absolute).replaceAll("\\", "/");
      lines.push(`${path}:${statSync(absolute).size}`);
    }
  }
}

function computeMediaVersion() {
  const lines = [];
  for (const dir of [join(PUBLIC, "assets"), join(PUBLIC, "sounds"), join(PUBLIC, "fonts")]) {
    if (existsSync(dir)) walk(dir, lines);
  }
  if (lines.length === 0) return "";
  lines.sort();
  return createHash("sha1").update(lines.join("\n")).digest("hex").slice(0, 10);
}

function isRealVercelBuild() {
  // `vercel build` can expose Vercel system variables on a developer machine.
  // Only the hosted Linux builder uses the disposable /vercel/... workspace.
  // If Vercel ever changes that path, we deliberately fall back to a normal
  // build (larger deployment, but zero chance of moving local source media).
  const hostedWorkspace =
    process.platform !== "win32" && ROOT.replaceAll("\\", "/").startsWith("/vercel/");
  return (
    process.env.HOMM3BG_VERCEL_BUILD_PROOF === "1" ||
    (hostedWorkspace &&
      process.env.VERCEL === "1" &&
      Boolean(process.env.VERCEL_ENV) &&
      Boolean(process.env.VERCEL_URL))
  );
}

function cdnBaseUrl() {
  const explicit = process.env.NEXT_PUBLIC_ASSET_BASE_URL?.trim();
  if (explicit) return explicit === "same-origin" ? "" : explicit.replace(/\/+$/u, "");
  return process.env.VERCEL_ENV === "preview" ? "https://cdn.hamthefirt.xyz" : "";
}

function runNext(extraEnv = {}) {
  const nextCli = require.resolve("next/dist/bin/next");
  const result = spawnSync(process.execPath, [nextCli, "build"], {
    cwd: ROOT,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function stageMedia() {
  if (existsSync(STAGING)) {
    throw new Error(`Refusing to overwrite an existing media staging directory: ${STAGING}`);
  }
  mkdirSync(STAGING, { recursive: true });
  for (const source of MEDIA_DIRS) {
    if (!existsSync(source)) throw new Error(`Required media directory is missing: ${source}`);
    renameSync(source, join(STAGING, source.endsWith("assets") ? "assets" : "sounds"));
  }

  // These small files are compile-time imports, not CDN payload. Keep them at
  // their original paths while Next builds the application bundles.
  mkdirSync(join(PUBLIC, "sounds"), { recursive: true });
  for (const name of SOUND_METADATA) {
    const source = join(STAGING, "sounds", name);
    if (!existsSync(source)) throw new Error(`Required sound metadata is missing: ${source}`);
    copyFileSync(source, join(PUBLIC, "sounds", name));
  }
}

function restoreMedia() {
  const stagedAssets = join(STAGING, "assets");
  const stagedSounds = join(STAGING, "sounds");
  if (existsSync(stagedAssets)) {
    if (existsSync(join(PUBLIC, "assets"))) rmSync(join(PUBLIC, "assets"), { recursive: true });
    renameSync(stagedAssets, join(PUBLIC, "assets"));
  }
  if (existsSync(stagedSounds)) {
    if (existsSync(join(PUBLIC, "sounds"))) rmSync(join(PUBLIC, "sounds"), { recursive: true });
    renameSync(stagedSounds, join(PUBLIC, "sounds"));
  }
  if (existsSync(STAGING)) rmSync(STAGING, { recursive: true });
}

if (!isRealVercelBuild()) {
  console.log("Not a Vercel build workspace; running the normal Next build without staging media.");
  process.exit(runNext());
}

const baseUrl = cdnBaseUrl();
if (!baseUrl) {
  throw new Error(
    "Refusing to omit public media: NEXT_PUBLIC_ASSET_BASE_URL must point to the Cloudflare CDN for a production Vercel build."
  );
}

const version = computeMediaVersion();
if (!version) throw new Error("Refusing to build without a non-empty media version.");

if (process.argv.includes("--check")) {
  const files = MEDIA_DIRS.reduce((total, dir) => {
    const lines = [];
    walk(dir, lines);
    return total + lines.length;
  }, 0);
  console.log(`Vercel media check passed: ${files} CDN files; version=${version}; CDN=${baseUrl}`);
  process.exit(0);
}

console.log(`Vercel CDN build: staging ${MEDIA_DIRS.length} media trees; version=${version}; CDN=${baseUrl}`);
try {
  stageMedia();
} catch (error) {
  restoreMedia();
  throw error;
}

let status = 1;
try {
  status = runNext({ NEXT_PUBLIC_ASSET_VERSION: version });
} catch (error) {
  restoreMedia();
  throw error;
}

if (status !== 0) {
  restoreMedia();
  process.exit(status);
}

console.log("Vercel CDN build complete; media remains in the ignored ephemeral staging directory.");

/**
 * Production Vercel build wrapper.
 *
 * Game media is served from Cloudflare R2 through content-addressed URLs
 * (docs/media-manifest.md); the binaries are NOT tracked in git, so a Vercel
 * checkout normally has no media to package at all. This wrapper remains the
 * safety net for a real Vercel build:
 *   1. verifies that the build resolves media to the CDN;
 *   2. derives the global media version from media-manifest.json;
 *   3. if a media tree IS present (a checkout that pulled it), stages the
 *      binaries under .vercel/.media-staging (which Vercel never deploys),
 *      retaining the tracked JSON sound manifests imported by application
 *      code; and
 *   4. runs Next with the precomputed version.
 *
 * The repository, Git history, PartyKit deployment and normal local
 * `npm run build` are untouched. A failed Next build restores everything
 * before exiting. Successful Vercel builds intentionally leave staged files in
 * the ignored staging area because the build workspace is ephemeral.
 */

import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

import { MEDIA_ROOTS, manifestVersion, readManifest, walkMediaTree } from "./lib/media-manifest.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const PUBLIC = join(ROOT, "public");
const STAGING = join(ROOT, ".vercel", ".media-staging");
const SOUND_METADATA = ["manifest.json", "durations.json"];
const require = createRequire(import.meta.url);

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
  // NOTE: the ranked-replay policy is NEVER trained here. A deploy must not
  // depend on Supabase credentials, on the network, or on a step that can
  // rewrite a tracked source file mid-build:
  // `src/engine/computer/learned-policy.json` is a COMMITTED artifact the
  // runtime imports, regenerated deliberately by `npm run train:ranked` and
  // reviewed in its own commit. See docs/computer-learning-runtime-2026-09-05.md.
  const nextCli = require.resolve("next/dist/bin/next");
  const result = spawnSync(process.execPath, [nextCli, "build"], {
    cwd: ROOT,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

/** Media roots that actually hold binaries on this checkout (a pulled tree). */
function rootsWithMedia() {
  return MEDIA_ROOTS.filter((root) => walkMediaTree(PUBLIC, root).media.length > 0);
}

function stageMedia(roots) {
  if (existsSync(STAGING)) {
    throw new Error(`Refusing to overwrite an existing media staging directory: ${STAGING}`);
  }
  mkdirSync(STAGING, { recursive: true });
  for (const root of roots) {
    renameSync(join(PUBLIC, root), join(STAGING, root));
  }
  // These small files are compile-time imports, not CDN payload. Keep them at
  // their original paths while Next builds the application bundles.
  if (roots.includes("sounds")) {
    mkdirSync(join(PUBLIC, "sounds"), { recursive: true });
    for (const name of SOUND_METADATA) {
      const source = join(STAGING, "sounds", name);
      if (!existsSync(source)) throw new Error(`Required sound metadata is missing: ${source}`);
      copyFileSync(source, join(PUBLIC, "sounds", name));
    }
  }
}

function restoreMedia() {
  for (const root of MEDIA_ROOTS) {
    const staged = join(STAGING, root);
    if (!existsSync(staged)) continue;
    if (existsSync(join(PUBLIC, root))) rmSync(join(PUBLIC, root), { recursive: true });
    renameSync(staged, join(PUBLIC, root));
  }
  if (existsSync(STAGING)) rmSync(STAGING, { recursive: true });
}

for (const name of SOUND_METADATA) {
  if (!existsSync(join(PUBLIC, "sounds", name))) {
    throw new Error(`Required tracked sound metadata is missing: public/sounds/${name}`);
  }
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

const manifest = readManifest(ROOT);
if (!manifest) throw new Error("media-manifest.json is missing — the build cannot resolve media URLs.");
const version = manifestVersion(manifest);
if (!version) throw new Error("Refusing to build without a non-empty media version (empty media-manifest.json).");
const roots = rootsWithMedia();

if (process.argv.includes("--check")) {
  console.log(
    `Vercel media check passed: ${Object.keys(manifest.files).length} manifest files; version=${version}; CDN=${baseUrl}; local media trees to stage: ${roots.length === 0 ? "none" : roots.join(", ")}`
  );
  process.exit(0);
}

console.log(
  `Vercel CDN build: version=${version}; CDN=${baseUrl}; ${roots.length === 0 ? "no local media to stage (expected — media lives on the CDN)" : `staging ${roots.join(", ")}`}`
);
try {
  if (roots.length > 0) stageMedia(roots);
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

console.log("Vercel CDN build complete.");

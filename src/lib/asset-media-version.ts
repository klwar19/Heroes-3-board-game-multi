/**
 * Build-time media VERSION — imported by next.config.ts ONLY (it reads the
 * filesystem, so it must never reach a client bundle; the runtime consumer,
 * asset-url.ts, reads the resulting NEXT_PUBLIC_ASSET_VERSION env instead).
 *
 * Since the content-addressed media layout (docs/media-manifest.md) every
 * published file already has an immutable per-file URL, so this global version
 * only cache-busts the LEGACY fallback (a path the runtime map does not know)
 * and the wildcard /assets|/sounds redirect. It is derived from
 * media-manifest.json — a hash of every key+md5 — so it moves whenever ANY
 * media changes and never on a code-only deploy. "" when the manifest is
 * absent or empty (unit fixtures) = unversioned URLs.
 */

import { mediaManifestVersion, readMediaManifest } from "./media-manifest";

export function computeMediaVersion(rootDir: string = process.cwd()): string {
  return mediaManifestVersion(readMediaManifest(rootDir));
}

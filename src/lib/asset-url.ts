/**
 * Resolve a static asset path (image or sound) to its final URL.
 *
 * All game art and audio are referenced as root-relative public paths
 * ("/assets/..." and "/sounds/..."). By default those are served by the same
 * host as the app (local development with the media pulled), so this returns
 * the path unchanged. Set NEXT_PUBLIC_ASSET_BASE_URL to the CDN origin
 * (https://cdn.hamthefirt.xyz — production, previews, and any checkout without
 * the media) to serve them from Cloudflare R2 instead.
 *
 * CONTENT-ADDRESSED OBJECTS (docs/media-manifest.md): the bucket stores every
 * file under an immutable key "<dir>/<name>.<md5[0:8]>.<ext>". The generated
 * runtime map ./media-keys.generated.json (written by `npm run media:publish`
 * beside media-manifest.json, ~50 KB brotli) turns the logical path into that
 * key, so a replaced file is a brand-new URL and no edge/browser cache can ever
 * serve stale bytes — no purge, no version query. A path the map does not know
 * (never published, or built from a stale map) falls back to the legacy layout:
 * the logical key plus ?v=<media version>, which the bucket still holds for
 * everything published before the content-addressed scheme.
 *
 * Every <img>/<image>, CSS-in-JS background, sprite sheet and sound flows
 * through this one helper (src/lib/asset-url-coverage.test.ts enforces it), so
 * the layout is a single seam. The url() references hard-coded in
 * src/app/globals.css cannot call JS; next.config.ts gives each of them an
 * exact redirect to its content-addressed object instead (src/lib/asset-cdn.ts).
 *
 * Already-absolute values (http(s):, protocol-relative //, data:, blob:) and
 * anything not starting with "/" pass through untouched, so it is always safe
 * to wrap a path whose origin you are unsure of, and wrapping twice is a no-op.
 *
 * The literal value "same-origin" (SAME_ORIGIN_SENTINEL) is treated as unset:
 * next.config.ts resolves it to "" at build time, and this runtime guard
 * ensures the raw sentinel can never leak into a URL prefix on the server.
 */

import { SAME_ORIGIN_SENTINEL } from "./asset-cdn";
import mediaKeys from "./media-keys.generated.json";

const RAW_ASSET_BASE = (process.env.NEXT_PUBLIC_ASSET_BASE_URL ?? "").trim();
const ASSET_BASE_URL =
  RAW_ASSET_BASE === SAME_ORIGIN_SENTINEL ? "" : RAW_ASSET_BASE.replace(/\/+$/, "");

// Global media version (a hash of the manifest) — only the LEGACY fallback for
// paths the runtime map does not know still needs it as a cache-buster.
const ASSET_VERSION = (process.env.NEXT_PUBLIC_ASSET_VERSION ?? "").trim();

const MEDIA_DIRS: Record<string, Record<string, string> | undefined> = mediaKeys.dirs;

/**
 * The configured external asset origin, or "" when assets are served
 * same-origin (the default). Used for <link rel="preconnect"> hints; use
 * assetUrl() for actual paths.
 */
export function assetBaseUrl(): string {
  return ASSET_BASE_URL;
}

/**
 * Map a root-relative public path to its content-addressed object path
 * ("/assets/ui/x.webp" → "/assets/ui/x.7f73e9cf.webp"), keeping any ?query /
 * #fragment the caller attached. Undefined when the runtime map has no entry
 * for the path (unpublished media, or a non-media path).
 */
export function contentAddressedPath(path: string): string | undefined {
  const suffixStart = path.search(/[?#]/u);
  const pathname = suffixStart === -1 ? path : path.slice(0, suffixStart);
  const suffix = suffixStart === -1 ? "" : path.slice(suffixStart);
  const key = pathname.replace(/^\/+/u, "");
  const slash = key.lastIndexOf("/");
  if (slash === -1) return undefined;
  const dir = key.slice(0, slash);
  const file = key.slice(slash + 1);
  const hash = MEDIA_DIRS[dir]?.[file];
  if (!hash) return undefined;
  const dot = file.lastIndexOf(".");
  const hashedFile = dot === -1 ? `${file}.${hash}` : `${file.slice(0, dot)}.${hash}${file.slice(dot)}`;
  return `/${dir}/${hashedFile}${suffix}`;
}

export function assetUrl(path: string): string;
export function assetUrl(path: string | undefined): string | undefined;
export function assetUrl(path: string | undefined): string | undefined {
  if (!ASSET_BASE_URL || path === undefined) {
    return path;
  }
  // Only rewrite our own root-relative public paths; leave absolute URLs,
  // data:/blob: URIs and already-prefixed values alone.
  if (!path.startsWith("/") || path.startsWith("//")) {
    return path;
  }
  const objectPath = contentAddressedPath(path);
  if (objectPath) {
    return `${ASSET_BASE_URL}${objectPath}`;
  }
  // Legacy fallback (unpublished / unmapped path): logical key + global version.
  if (!ASSET_VERSION) {
    return `${ASSET_BASE_URL}${path}`;
  }
  const sep = path.includes("?") ? "&" : "?";
  return `${ASSET_BASE_URL}${path}${sep}v=${ASSET_VERSION}`;
}

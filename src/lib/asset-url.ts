/**
 * Resolve a static asset path (image or sound) to its final URL.
 *
 * All game art and audio live under /public and are referenced as root-relative
 * paths ("/assets/..." and "/sounds/..."). By default those are served by the
 * same host as the app, so this returns the path unchanged — zero behaviour
 * change. Set NEXT_PUBLIC_ASSET_BASE_URL to an external origin (e.g. a
 * Cloudflare R2 / CDN domain such as "https://cdn.example.com") to serve them
 * from there instead.
 *
 * Every <img>/<image>, CSS-in-JS background, sprite sheet and sound flows
 * through this one helper, so moving to R2 is a single env change rather than
 * hundreds of edits. (The only exception is the handful of background images
 * hard-coded in src/app/globals.css, which CSS cannot route through JS — grep
 * globals.css for "/assets/" before flipping the env var.)
 *
 * Already-absolute values (http(s):, protocol-relative //, data:, blob:) and
 * anything not starting with "/" pass through untouched, so it is always safe
 * to wrap a path whose origin you are unsure of, and wrapping twice is a no-op.
 */

const ASSET_BASE_URL = (process.env.NEXT_PUBLIC_ASSET_BASE_URL ?? "").replace(/\/+$/, "");

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
  return `${ASSET_BASE_URL}${path}`;
}

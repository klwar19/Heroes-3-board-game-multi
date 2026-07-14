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
 * hundreds of edits. (The url() references hard-coded in src/app/globals.css
 * cannot call JS; they are covered instead by the /assets|/sounds|/fonts
 * redirects in next.config.ts — see src/lib/asset-cdn.ts.)
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

const RAW_ASSET_BASE = (process.env.NEXT_PUBLIC_ASSET_BASE_URL ?? "").trim();
const ASSET_BASE_URL =
  RAW_ASSET_BASE === SAME_ORIGIN_SENTINEL ? "" : RAW_ASSET_BASE.replace(/\/+$/, "");

/**
 * The configured external asset origin, or "" when assets are served
 * same-origin (the default). Used for <link rel="preconnect"> hints; use
 * assetUrl() for actual paths.
 */
export function assetBaseUrl(): string {
  return ASSET_BASE_URL;
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
  return `${ASSET_BASE_URL}${path}`;
}

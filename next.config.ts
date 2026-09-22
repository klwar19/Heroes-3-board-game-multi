import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { assetRedirects, cssAssetRedirects, resolveAssetBaseUrl } from "./src/lib/asset-cdn";
import { computeMediaVersion } from "./src/lib/asset-media-version";
import { cdnObjectPath, cssMediaRefs, hasLocalMediaTree } from "./src/lib/media-manifest";

// Binary media is not tracked in git (docs/media-manifest.md): a checkout that
// has not run `npm run media:pull` has nothing to serve same-origin, so such a
// build defaults to the CDN. A checkout WITH the media keeps the classic
// same-origin default (local dev against your own files).
const localMediaPresent = hasLocalMediaTree();

// One resolved value feeds BOTH the client bundle (env below) and the
// redirect table, so they can never disagree. Explicit env var wins;
// Vercel previews and media-less checkouts default to the canonical CDN;
// everything else is same-origin. See src/lib/asset-cdn.ts.
const assetBaseUrl = resolveAssetBaseUrl(process.env, { localMediaPresent });
if (assetBaseUrl && !process.env.NEXT_PUBLIC_ASSET_BASE_URL && !localMediaPresent) {
  console.log(`[media] no local media tree — serving /assets and /sounds from ${assetBaseUrl} (run \`npm run media:pull\` for same-origin files)`);
}

// Global media version derived from media-manifest.json. Every published file
// already has an immutable content-addressed URL (asset-url.ts), so this only
// cache-busts the LEGACY fallback: unmapped paths and the wildcard redirect.
// Computed only when assets are actually served from a CDN; same-origin builds
// stay unversioned. The Vercel build wrapper (scripts/vercel-build.mjs) passes
// it in explicitly; normal builds derive it here.
const assetVersion = assetBaseUrl
  ? process.env.NEXT_PUBLIC_ASSET_VERSION?.trim() || computeMediaVersion()
  : "";

// The url() references hard-coded in globals.css cannot call assetUrl(), so
// each gets an exact redirect to its content-addressed object (listed before
// the wildcard). src/lib/media-manifest.test.ts pins that every ref is a
// published file.
const stylesheetRefs = cssMediaRefs(readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8"));

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_ASSET_BASE_URL: assetBaseUrl,
    NEXT_PUBLIC_ASSET_VERSION: assetVersion
  },
  // Send same-origin /assets|/sounds(/fonts) requests to the CDN. Next matches
  // redirects before the public/ filesystem, so this covers globals.css url()
  // refs (exact, content-addressed) and any stray raw literal (wildcard,
  // legacy layout); assetUrl() call sites already emit absolute CDN URLs and
  // never take this hop. Empty when assets are same-origin (env var unset with
  // the media present / "same-origin"), i.e. zero behaviour change there.
  async redirects() {
    return [
      ...cssAssetRedirects(assetBaseUrl, stylesheetRefs, (path) => cdnObjectPath(path)),
      ...assetRedirects(assetBaseUrl, undefined, assetVersion)
    ];
  },
  // Code-shipped media (assetUrl() leaves /fx, /game-tokens and /factory-cards
  // on the app origin — see src/lib/asset-url.ts) and the same-origin fonts are
  // served by Vercel with its default "max-age=0, must-revalidate": every
  // combat FX sheet, token and card face is re-validated on every page load
  // (one round trip each, ~150 ms from Asia). These paths are not
  // content-addressed, so a short max-age keeps a replaced file fresh within
  // minutes while stale-while-revalidate lets the browser paint the cached copy
  // at once and refresh it in the background. Fonts never change: immutable.
  async headers() {
    const shippedMedia = "public, max-age=600, stale-while-revalidate=604800";
    return [
      { source: "/fx/:path*", headers: [{ key: "Cache-Control", value: shippedMedia }] },
      { source: "/game-tokens/:path*", headers: [{ key: "Cache-Control", value: shippedMedia }] },
      { source: "/factory-cards/:path*", headers: [{ key: "Cache-Control", value: shippedMedia }] },
      { source: "/ui/:path*", headers: [{ key: "Cache-Control", value: shippedMedia }] },
      { source: "/map-designer/:path*", headers: [{ key: "Cache-Control", value: shippedMedia }] },
      { source: "/credits/:path*", headers: [{ key: "Cache-Control", value: shippedMedia }] },
      { source: "/fonts/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] }
    ];
  },
  // Runtime room-file reads opt out of tracing in game-room-store.ts. Keep
  // static media and offline tooling excluded as a packaging safeguard;
  // server functions do not read these directories.
  outputFileTracingExcludes: {
    "*": [
      "public/**",
      "scripts/**",
      "artifacts/**",
      "generated-session-art/**",
      "assets-to-translate/**",
      "sounds-incoming/**",
      "supabase/**",
      "docs/**",
      "tests/**",
      "coverage/**",
      ".github/**",
      "media-manifest.json"
    ]
  },
  // `next dev` (Next 16) blocks cross-origin access to its dev-only resources
  // (HMR socket, /_next/static chunks) unless the requesting host is allow-listed.
  // The Playwright e2e suite drives the app at http://127.0.0.1:3000, which Next
  // treats as a different origin from the canonical `localhost`, so without this
  // the app never hydrates under test. Dev-only; ignored by `next build`/start.
  allowedDevOrigins: ["127.0.0.1"],
  // The dev-tools badge floats bottom-left by default — on a phone viewport
  // that is exactly the phone UI mode's Map tab, and its portal swallows the
  // tap (breaks the e2e suite; annoying in real dev too). Dev-only chrome;
  // production builds render no indicator either way.
  devIndicators: {
    position: "top-right"
  }
};

export default nextConfig;

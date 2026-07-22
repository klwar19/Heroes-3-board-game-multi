import type { NextConfig } from "next";

import { assetRedirects, resolveAssetBaseUrl } from "./src/lib/asset-cdn";

// One resolved value feeds BOTH the client bundle (env below) and the
// redirect table, so they can never disagree. Explicit env var wins;
// Vercel previews default to the canonical CDN; everything else is
// same-origin. See src/lib/asset-cdn.ts.
const assetBaseUrl = resolveAssetBaseUrl(process.env);

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_ASSET_BASE_URL: assetBaseUrl
  },
  // Send same-origin /assets|/sounds(/fonts) requests to the CDN. Next matches
  // redirects before the public/ filesystem, so this covers globals.css url()
  // refs and any stray raw literal; assetUrl() call sites already emit
  // absolute CDN URLs and never take this hop. Empty when assets are
  // same-origin (env var unset / "same-origin"), i.e. zero behaviour change
  // for local dev and CI.
  async redirects() {
    return assetRedirects(assetBaseUrl);
  },
  // The room API routes import src/server/game-room-store.ts, which persists rooms
  // with runtime fs reads/writes against a dynamic path (HOMM3BG_ROOM_DIR env var,
  // falling back to the OS temp dir). Next.js's file tracer cannot statically resolve
  // that path, so it conservatively traces the WHOLE project and bundles every file
  // that is NOT excluded here into each serverless function — pushing
  // api/rooms/[roomId]/actions past Vercel's uncompressed function-size limit.
  //
  // Everything listed below is either served from Vercel's static CDN (public/**)
  // or is BUILD-TIME-ONLY tooling that a running function never reads: the art
  // pipeline sources (raw illustration masters, editable SVGs, preview/session-art
  // renders — hundreds of MB across every faction), design docs, tests and the
  // e2e suite. Excluding them keeps every function bundle to single-digit MB
  // regardless of how much art source the repo carries, with zero runtime change.
  // (The engine reads its data from imported TS modules under src/**, never from
  // these paths, so none of them can be a runtime dependency.)
  outputFileTracingExcludes: {
    "*": [
      "public/**",
      "scripts/**",
      "generated-session-art/**",
      "assets-to-translate/**",
      "sounds-incoming/**",
      "supabase/**",
      "docs/**",
      "tests/**",
      "coverage/**",
      ".github/**"
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

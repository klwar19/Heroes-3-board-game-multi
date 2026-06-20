import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The room API routes import src/server/game-room-store.ts, which persists rooms
  // with runtime fs reads/writes against a dynamic path (HOMM3BG_ROOM_DIR env var,
  // falling back to the OS temp dir). Next.js's file tracer cannot statically resolve
  // that path, so it conservatively traces the WHOLE project and bundles every file
  // under public/ (~320MB of board art, sounds and hero images) into each serverless
  // function — pushing api/rooms/[roomId]/actions past Vercel's 300MB function limit.
  //
  // Files under public/ are always served from Vercel's static CDN and are never read
  // from inside a function, so exclude them from every function's trace. This drops the
  // function bundle from ~330MB to single-digit MB without changing runtime behaviour.
  outputFileTracingExcludes: {
    "*": ["public/**"]
  },
  // `next dev` (Next 16) blocks cross-origin access to its dev-only resources
  // (HMR socket, /_next/static chunks) unless the requesting host is allow-listed.
  // The Playwright e2e suite drives the app at http://127.0.0.1:3000, which Next
  // treats as a different origin from the canonical `localhost`, so without this
  // the app never hydrates under test. Dev-only; ignored by `next build`/start.
  allowedDevOrigins: ["127.0.0.1"]
};

export default nextConfig;

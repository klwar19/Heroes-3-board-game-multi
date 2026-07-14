/**
 * Build-time CDN wiring shared by next.config.ts and the runtime asset helpers
 * (docs/cloudflare-custom-domain-cdn-plan.md — "Live rollout status" section).
 *
 * Two jobs, both driven by ONE resolved base URL so the client bundle and the
 * server's redirect table can never disagree:
 *
 * 1. resolveAssetBaseUrl() — decides which origin serves /assets, /sounds and
 *    /fonts for THIS build. An explicit NEXT_PUBLIC_ASSET_BASE_URL always wins
 *    (Production stays purely dashboard-driven, so the documented rollback —
 *    delete the env var, redeploy — keeps working). Vercel PREVIEW builds with
 *    no explicit value default to the canonical CDN, closing the old gap where
 *    previews silently exercised same-origin assets and burned Vercel
 *    bandwidth. The literal value "same-origin" forces the default behaviour
 *    anywhere (e.g. to opt a preview back out without deleting the var).
 *
 * 2. assetRedirects() — Next.js redirects() entries sending same-origin
 *    /assets/**, /sounds/** (and /fonts/** once the bucket serves fonts with
 *    CORS) to the CDN. Next matches redirects BEFORE the public/ filesystem,
 *    so this catches the requests assetUrl() cannot reach: the url() refs in
 *    globals.css, @font-face sources, and any future raw literal — defense in
 *    depth on top of src/lib/asset-url-coverage.test.ts. assetUrl() call sites
 *    still emit absolute CDN URLs and never pay the redirect hop. Temporary
 *    (307) on purpose: browsers do not cache 307s aggressively, so unsetting
 *    the env var rolls players back to same-origin without stale-redirect
 *    weirdness.
 */

/** Canonical production CDN origin (Cloudflare R2 custom domain). */
export const PRODUCTION_CDN_URL = "https://cdn.hamthefirt.xyz";

/**
 * Sentinel env value that forces same-origin asset serving even where a
 * default would apply (previews). Recognised by resolveAssetBaseUrl() AND by
 * asset-url.ts at runtime, so a dashboard value of "same-origin" can never
 * leak into a URL prefix.
 */
export const SAME_ORIGIN_SENTINEL = "same-origin";

/**
 * Whether the R2 bucket is verified to serve /fonts/** WITH CORS headers.
 * Fonts are the one asset class fetched in CORS mode (@font-face), so they
 * only move off the app origin once both are live on the CDN:
 *   1. public/fonts synced to the bucket   (scripts/sync-assets-to-r2.sh /
 *      the sync-media-r2 workflow), and
 *   2. a bucket CORS policy allowing the app origins (npm run setup:r2-cors).
 * Verify before flipping to true, and re-verify if the bucket CORS policy
 * ever changes:
 *   curl -sI -H "Origin: https://hamthefirt.xyz" \
 *     https://cdn.hamthefirt.xyz/fonts/LiberationSerif-Regular.ttf
 *   → expect 200 + an access-control-allow-origin header.
 * While false, @font-face keeps loading from the app origin (no CORS needed).
 */
export const CDN_SERVES_FONTS = false;

/** URL path prefixes (under public/) that live on the CDN. */
export function cdnPathPrefixes(includeFonts: boolean = CDN_SERVES_FONTS): string[] {
  return includeFonts ? ["assets", "sounds", "fonts"] : ["assets", "sounds"];
}

export function resolveAssetBaseUrl(
  // Reads NEXT_PUBLIC_ASSET_BASE_URL and VERCEL_ENV; typed as a plain env
  // record so process.env (index-signature-only ProcessEnv) is assignable.
  env: Record<string, string | undefined> = process.env
): string {
  const explicit = env.NEXT_PUBLIC_ASSET_BASE_URL?.trim();
  if (explicit) {
    return explicit === SAME_ORIGIN_SENTINEL ? "" : explicit.replace(/\/+$/, "");
  }
  if (env.VERCEL_ENV === "preview") {
    return PRODUCTION_CDN_URL;
  }
  return "";
}

export interface AssetRedirect {
  source: string;
  destination: string;
  permanent: boolean;
}

export function assetRedirects(
  baseUrl: string,
  includeFonts: boolean = CDN_SERVES_FONTS
): AssetRedirect[] {
  if (!baseUrl) {
    return [];
  }
  const base = baseUrl.replace(/\/+$/, "");
  return cdnPathPrefixes(includeFonts).map((prefix) => ({
    source: `/${prefix}/:path*`,
    destination: `${base}/${prefix}/:path*`,
    permanent: false
  }));
}

import { CDN_SERVES_FONTS } from "@/lib/asset-cdn";
import { assetBaseUrl } from "@/lib/asset-url";

/**
 * Emits <link rel="preconnect"> / dns-prefetch hints for the external asset
 * origin when NEXT_PUBLIC_ASSET_BASE_URL is set (the Cloudflare CDN domain —
 * docs/cloudflare-custom-domain-cdn-plan.md), so the browser opens the
 * DNS+TLS+HTTP connection to the CDN in parallel with the page instead of on
 * the first <img>/audio request. React hoists these links into <head>.
 * Renders nothing in the default same-origin setup.
 *
 * The plain (no crossorigin) preconnect covers the no-cors fetches: <img>,
 * CSS backgrounds, HTMLAudioElement. When fonts are served from the CDN too
 * (CDN_SERVES_FONTS), a second preconnect WITH crossorigin is emitted —
 * @font-face fetches run in CORS mode, and browsers keep separate connection
 * pools for CORS vs no-CORS, so each pool needs its own warmed connection.
 */
export function AssetPreconnect() {
  const base = assetBaseUrl();
  if (!base) {
    return null;
  }
  return (
    <>
      <link href={base} rel="preconnect" />
      {CDN_SERVES_FONTS ? <link crossOrigin="anonymous" href={base} rel="preconnect" /> : null}
      <link href={base} rel="dns-prefetch" />
    </>
  );
}

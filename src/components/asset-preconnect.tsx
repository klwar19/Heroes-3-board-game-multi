import { assetBaseUrl } from "@/lib/asset-url";

/**
 * Emits <link rel="preconnect"> / dns-prefetch hints for the external asset
 * origin when NEXT_PUBLIC_ASSET_BASE_URL is set (the Cloudflare CDN domain —
 * docs/cloudflare-custom-domain-cdn-plan.md), so the browser opens the
 * DNS+TLS+HTTP connection to the CDN in parallel with the page instead of on
 * the first <img>/audio request. React hoists these links into <head>.
 * Renders nothing in the default same-origin setup. No crossorigin attribute:
 * all CDN fetches are no-cors (<img>, CSS backgrounds, HTMLAudioElement).
 */
export function AssetPreconnect() {
  const base = assetBaseUrl();
  if (!base) {
    return null;
  }
  return (
    <>
      <link href={base} rel="preconnect" />
      <link href={base} rel="dns-prefetch" />
    </>
  );
}

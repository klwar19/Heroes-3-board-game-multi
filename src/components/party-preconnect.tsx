import { partyOriginUrl } from "@/lib/party-origin";

/**
 * Emits <link rel="preconnect"> / dns-prefetch hints for the PartyKit room
 * host when NEXT_PUBLIC_PARTYKIT_HOST is set, so the browser warms
 * DNS+TCP+TLS to the edge during initial page load — the room page's first
 * contact is a cross-origin HTTPS snapshot fetch racing the WSS upgrade, and
 * warming the connection overlaps that setup (often 100–300 ms cross-region)
 * with bundle parse. Rendered from the root layout so the hints are in the
 * initial HTML, not discovered after hydration. React hoists these links into
 * <head>. Renders nothing on the built-in same-origin backend.
 *
 * Two preconnects on purpose (same dual-pool subtlety as AssetPreconnect's
 * font branch): the WebSocket upgrade rides the credentialed (no-crossorigin)
 * pool, while the snapshot fetch() is a CORS request served from the
 * anonymous pool — browsers keep separate connection pools for the two, so
 * each needs its own warmed connection. Do not merge them or add crossorigin
 * to the first. This is only a connection hint — the actual socket needs a
 * roomId/ticket and is opened by the room page effect, never from here.
 */
export function PartyPreconnect() {
  const origin = partyOriginUrl();
  if (!origin) {
    return null;
  }
  return (
    <>
      <link href={origin} rel="preconnect" />
      <link crossOrigin="anonymous" href={origin} rel="preconnect" />
      <link href={origin} rel="dns-prefetch" />
    </>
  );
}

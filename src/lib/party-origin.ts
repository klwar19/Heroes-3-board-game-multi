/**
 * PartyKit host/origin resolution, shared by the room transport
 * (src/lib/realtime.ts), the maps party client (src/lib/shared-maps.ts) and
 * the <PartyPreconnect> head hint. Lives in its own module WITHOUT
 * "use client" so the server-rendered root layout can call it without pulling
 * the whole socket transport (partysocket etc.) into the layout bundle.
 */

export function getPartyKitHost(): string | null {
  const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST;
  return host && host.trim().length > 0 ? host.trim() : null;
}

/** Local `npx partykit dev` serves plain http; the deployed edge is https. */
export function partyProtocol(host: string): string {
  return host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
}

/**
 * The PartyKit origin (scheme + host, no path) for connection hints, or null
 * when no host is configured (the built-in same-origin backend needs none).
 */
export function partyOriginUrl(): string | null {
  const host = getPartyKitHost();
  return host ? `${partyProtocol(host)}://${host}` : null;
}

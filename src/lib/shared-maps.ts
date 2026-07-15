"use client";

import { getPartyKitHost, partyProtocol } from "@/lib/party-origin";
import { MAPS_SINGLETON_ID, type SharedMapRecord } from "@/server/map-registry";

export type { SharedMapRecord };

/**
 * Client transport for the shared map library — the catalog of designed maps the
 * map designer saves to and the lobby picks from. Two backends share one
 * interface, exactly like the room transport in `realtime.ts`:
 *
 *  - PartyKit edge: the `maps` Durable Object at `/parties/maps/catalog`,
 *    enabled by NEXT_PUBLIC_PARTYKIT_HOST.
 *  - The built-in Next.js `/api/maps` route, used when no PartyKit host is set.
 *
 * Maps live on the SERVER, so every player who opens the app sees the same
 * library: anyone can open, edit (save over an id), play, or delete any map.
 * `clientId` / `displayName` are stamped on a save for attribution only.
 */

/** The endpoint for the current backend: the PartyKit maps party, else /api/maps. */
function mapsEndpoint(): string {
  const host = getPartyKitHost();
  return host
    ? `${partyProtocol(host)}://${host}/parties/maps/${encodeURIComponent(MAPS_SINGLETON_ID)}`
    : "/api/maps";
}

/** Every saved map, newest first. Resolves `[]` if the library can't be reached. */
export async function fetchSharedMaps(): Promise<SharedMapRecord[]> {
  try {
    const response = await fetch(mapsEndpoint(), { cache: "no-store" });
    if (!response.ok) {
      return [];
    }
    const data = (await response.json()) as { maps?: SharedMapRecord[] };
    return Array.isArray(data.maps) ? data.maps : [];
  } catch {
    return [];
  }
}

export type SaveSharedMapInput = {
  id: string;
  name: string;
  scenarioId: string;
  players: number;
  tiles: SharedMapRecord["tiles"];
  /** Optional map-only scenario conditions. */
  preset?: SharedMapRecord["preset"];
  createdByClientId?: string | null;
  createdByName?: string | null;
};

export type SaveSharedMapOutcome =
  | { ok: true; map: SharedMapRecord; maps: SharedMapRecord[] }
  | { ok: false; error: string };

/** Inserts or overwrites a map on the server. Editing reuses the same id. */
export async function saveSharedMap(input: SaveSharedMapInput): Promise<SaveSharedMapOutcome> {
  try {
    const response = await fetch(mapsEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });
    const data = (await response.json().catch(() => null)) as
      | { ok?: boolean; map?: SharedMapRecord; maps?: SharedMapRecord[]; error?: string }
      | null;
    if (!response.ok || !data?.ok || !data.map || !data.maps) {
      return { ok: false, error: data?.error ?? "Could not save the map." };
    }
    return { ok: true, map: data.map, maps: data.maps };
  } catch {
    return { ok: false, error: "Could not reach the map library." };
  }
}

/** Deletes a map for everyone. Returns the remaining library (or `null` on failure). */
export async function deleteSharedMap(id: string): Promise<SharedMapRecord[] | null> {
  try {
    const response = await fetch(mapsEndpoint(), {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json().catch(() => null)) as { maps?: SharedMapRecord[] } | null;
    return Array.isArray(data?.maps) ? (data!.maps as SharedMapRecord[]) : null;
  } catch {
    return null;
  }
}

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
 * library and can open, play, and COPY any map. A map created by a signed-in
 * player is OWNED, though: only its owner or an admin may edit (save over its id)
 * or delete it. The acting account (`actorUserId` / `actorRole`) rides the save /
 * delete body so the server can enforce that gate — authoritatively from the
 * session cookie on `/api/maps`, and as a casual gate on the PartyKit edge.
 * `clientId` / `displayName` remain attribution-only.
 */

/** The acting account for a map mutation (owner / admin gate). */
export type MapActorInput = { userId: string | null; role: "player" | "admin" | null };

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
  /** Acting account, so the server can enforce the owner/admin edit gate. */
  actorUserId?: string | null;
  actorRole?: "player" | "admin" | null;
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

/**
 * Deletes a map for everyone. Returns the remaining library (or `null` on
 * failure — including a 403 when the caller is not the owner/admin of an owned
 * map). `actor` (when the caller is signed in) rides the body so the server can
 * enforce the gate; it is omitted for a guest so an unowned map deletes as before.
 */
export async function deleteSharedMap(
  id: string,
  actor?: MapActorInput | null
): Promise<SharedMapRecord[] | null> {
  try {
    const body: Record<string, unknown> = { id };
    if (actor?.userId) {
      body.actorUserId = actor.userId;
      body.actorRole = actor.role;
    }
    const response = await fetch(mapsEndpoint(), {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
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

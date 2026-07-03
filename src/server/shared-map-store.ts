import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileAtomic } from "@/server/atomic-file";
import { MapRegistry, sanitizeSharedMap, type SharedMapRecord } from "@/server/map-registry";

/**
 * The built-in (non-PartyKit) shared-map library. It is the Node counterpart of
 * the PartyKit maps Durable Object (`party/maps.ts`): both wrap the isomorphic
 * {@link MapRegistry}, so the catalog behaves identically on either backend. The
 * `/api/maps` route is a thin HTTP shell over the three functions here.
 *
 * Maps are persisted to a single JSON file so the library survives a dev-server
 * restart or an idle host recycle (best effort — a read-only FS keeps the
 * in-memory copy only). The registry lives on `globalThis` so Next's per-request
 * module isolation doesn't hand out a fresh, empty catalog each call.
 */

declare global {
  var __homm3bgMapRegistry: MapRegistry | undefined;
}

const persistDir = process.env.HOMM3BG_ROOM_DIR ?? join(tmpdir(), "homm3bg-rooms");
const mapsFilePath = join(persistDir, "shared-maps.json");

function loadFromDisk(): SharedMapRecord[] {
  try {
    if (!existsSync(mapsFilePath)) {
      return [];
    }
    const parsed: unknown = JSON.parse(readFileSync(mapsFilePath, "utf8"));
    if (!Array.isArray(parsed)) {
      return [];
    }
    // Re-sanitize on load so a hand-edited or stale-shaped file can't poison the
    // catalog; updatedAt is preserved from disk so ordering survives a restart.
    return parsed
      .map((record) => {
        const clean = sanitizeSharedMap(record, 0);
        if (!clean) {
          return null;
        }
        const stored = record as Partial<SharedMapRecord>;
        return {
          ...clean,
          createdAt: typeof stored.createdAt === "number" ? stored.createdAt : clean.createdAt,
          updatedAt: typeof stored.updatedAt === "number" ? stored.updatedAt : clean.createdAt
        } satisfies SharedMapRecord;
      })
      .filter((record): record is SharedMapRecord => record !== null);
  } catch {
    return [];
  }
}

function getRegistry(): MapRegistry {
  if (!globalThis.__homm3bgMapRegistry) {
    globalThis.__homm3bgMapRegistry = new MapRegistry(loadFromDisk());
  }
  return globalThis.__homm3bgMapRegistry;
}

function persist(registry: MapRegistry): void {
  try {
    // Atomic (temp + rename) so a crash mid-write can't truncate the library.
    writeFileAtomic(mapsFilePath, JSON.stringify(registry.records()));
  } catch {
    // Opportunistic: the in-memory registry keeps working without the file.
  }
}

/** Every saved map, newest first. */
export function listSharedMaps(): SharedMapRecord[] {
  return getRegistry().list();
}

export type SaveSharedMapResult =
  | { ok: true; map: SharedMapRecord; maps: SharedMapRecord[] }
  | { ok: false; error: string };

/**
 * Inserts or overwrites a map (editing reuses its id). Untrusted input is
 * sanitized; anything that isn't a map at all (no tile array) is rejected so the
 * caller can answer 400 rather than silently storing junk.
 */
export function saveSharedMap(input: unknown): SaveSharedMapResult {
  const record = sanitizeSharedMap(input);
  if (!record) {
    return { ok: false, error: "A map needs a tiles array." };
  }
  const registry = getRegistry();
  // Editing keeps the original creation stamp rather than re-minting it.
  const existing = registry.get(record.id);
  if (existing) {
    record.createdAt = existing.createdAt;
  }
  registry.upsert(record);
  persist(registry);
  return { ok: true, map: record, maps: registry.list() };
}

/** Deletes a map for everyone. Returns the remaining library. */
export function deleteSharedMap(id: string): SharedMapRecord[] {
  const registry = getRegistry();
  if (registry.remove(id)) {
    persist(registry);
  }
  return registry.list();
}

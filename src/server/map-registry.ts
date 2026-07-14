import {
  isSecretTileFeature,
  sanitizeCustomMapPreset,
  scenarioDefinitions,
  type CustomMapPreset,
  type CustomMapTilePlan
} from "@/engine";

/**
 * Pure, isomorphic shared-map catalog logic — the single source of truth for the
 * server-side library of designed maps. It has NO node / server-only / DOM
 * imports (only the isomorphic engine), so every backend shares the exact same
 * rules, exactly like {@link LobbyRegistry} does for the room directory:
 *
 *  - the PartyKit maps Durable Object (`party/maps.ts`) holds a `MapRegistry` and
 *    answers the edge map library,
 *  - the built-in Node map store (`shared-map-store.ts`) holds one and persists it
 *    to disk so maps survive a host recycle,
 *  - the browser client (`src/lib/shared-maps.ts`) imports the shared id + type.
 *
 * Maps are FULLY SHARED: any logged-in player can open, edit (overwrite by id),
 * play, or delete any saved map. `createdByName` is attribution only — it is
 * never an edit/delete gate.
 */

/**
 * The fixed Durable Object id of the single map-catalog instance, addressed at
 * `/parties/maps/<MAPS_SINGLETON_ID>`. Mirrors {@link LOBBY_SINGLETON_ID}; it
 * never collides with a room id (rooms live in the `main` party).
 */
export const MAPS_SINGLETON_ID = "catalog";

export const MAX_MAP_NAME_LENGTH = 48;
/** Lowest / highest seat count a designed map can open. */
export const MIN_MAP_PLAYERS = 2;
export const MAX_MAP_PLAYERS = 4;
/**
 * Total maps the catalog keeps. Beyond this the oldest-touched maps are evicted
 * on upsert, so the shared library can't grow without bound.
 */
export const MAX_STORED_MAPS = 200;

/**
 * One saved map in the shared library. `players` is the number of seats the map
 * opens when picked (clamped to its scenario's range); `tiles` is the same
 * designer plan the engine already consumes (`CustomMapTilePlan[]`), so a stored
 * map round-trips straight into a game with no translation.
 */
export type SharedMapRecord = {
  id: string;
  name: string;
  scenarioId: string;
  players: number;
  tiles: CustomMapTilePlan[];
  /**
   * Optional map-only scenario conditions (resources, army, buildings, timed
   * events, victory preset, designer notes). Applied when the lobby picks this
   * map. Absent on older saves = pure tile layout.
   */
  preset?: CustomMapPreset;
  /** Stable client id of whoever last saved it (attribution only). */
  createdByClientId: string | null;
  /** Display name of whoever last saved it (attribution only). */
  createdByName: string | null;
  createdAt: number;
  updatedAt: number;
};

/** Every tile role the designer can place — all of these must round-trip. */
const VALID_TILE_GROUPS = new Set<CustomMapTilePlan["group"]>([
  "starting",
  "far",
  "near",
  "center",
  "sea",
  "subterranean"
]);

/** A new, collision-resistant map id (used when input carries none). */
export function newSharedMapId(): string {
  return `map_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Clamps a requested seat count into a scenario's allowed range, so a stored map
 * can never claim a player count the scenario can't seat (e.g. a 2-player-only
 * symmetric map asking for 4). Mirrors the engine's `clampSeatCount`: the ceiling
 * is the scenario's `maxPlayers` AND its number of start positions, capped at 4.
 */
export function clampMapPlayers(scenarioId: string, requested: unknown): number {
  const scenario = scenarioDefinitions[scenarioId];
  if (!scenario) {
    return MIN_MAP_PLAYERS;
  }
  const ceiling = Math.min(scenario.maxPlayers, scenario.layout.starts.length, MAX_MAP_PLAYERS);
  const floor = Math.max(MIN_MAP_PLAYERS, scenario.minPlayers);
  const wanted = typeof requested === "number" && Number.isFinite(requested) ? Math.floor(requested) : floor;
  return Math.max(floor, Math.min(ceiling, wanted));
}

/** Drops a malformed tile; keeps and normalises a well-formed one. */
function sanitizeTile(tile: unknown): CustomMapTilePlan | null {
  if (!tile || typeof tile !== "object") {
    return null;
  }
  const candidate = tile as Partial<CustomMapTilePlan>;
  if (!Number.isInteger(candidate.row) || !Number.isInteger(candidate.col)) {
    return null;
  }
  if (
    typeof candidate.group !== "string" ||
    !VALID_TILE_GROUPS.has(candidate.group as CustomMapTilePlan["group"])
  ) {
    return null;
  }
  // Monolith/Whirlpool token: keep a well-formed kind; the designed slot (a
  // face-up tile's fixed field, 0-6) only when it is a plausible slot index.
  const token =
    candidate.token && (candidate.token.kind === "monolith" || candidate.token.kind === "whirlpool")
      ? {
          kind: candidate.token.kind,
          ...(Number.isInteger(candidate.token.slot) &&
          (candidate.token.slot as number) >= 0 &&
          (candidate.token.slot as number) <= 6
            ? { slot: candidate.token.slot as number }
            : {})
        }
      : undefined;
  // Secret landmark filter (face-down only). Exact tileDefId pin still wins
  // at setup if both are present; sanitize keeps both so old maps round-trip.
  // The engine's isSecretTileFeature guard is the single feature-id allow-list.
  const secretFeature = isSecretTileFeature(candidate.secretFeature)
    ? candidate.secretFeature
    : undefined;

  return {
    row: candidate.row as number,
    col: candidate.col as number,
    group: candidate.group as CustomMapTilePlan["group"],
    faceDown: Boolean(candidate.faceDown),
    ...(typeof candidate.tileDefId === "string" ? { tileDefId: candidate.tileDefId } : {}),
    ...(secretFeature && Boolean(candidate.faceDown) ? { secretFeature } : {}),
    ...(Number.isInteger(candidate.rotation) ? { rotation: (((candidate.rotation as number) % 6) + 6) % 6 } : {}),
    ...(candidate.seaBand === "iv-v" || candidate.seaBand === "vi-vii" ? { seaBand: candidate.seaBand } : {}),
    ...(candidate.subBand === "iv-v" || candidate.subBand === "vi-vii" ? { subBand: candidate.subBand } : {}),
    ...(token ? { token } : {})
  };
}

/**
 * Turns untrusted input (an HTTP body, a stored record) into a clean
 * `SharedMapRecord`, or `null` when it isn't a map at all (no tile array). An
 * unknown scenario falls back to the default skirmish so a typo can't orphan a
 * map; the player count is clamped to the resulting scenario, and `updatedAt` is
 * always stamped fresh so the most recently saved map sorts first.
 */
export function sanitizeSharedMap(input: unknown, now: number = Date.now()): SharedMapRecord | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const candidate = input as Partial<SharedMapRecord>;
  if (!Array.isArray(candidate.tiles)) {
    return null;
  }
  const scenarioId =
    typeof candidate.scenarioId === "string" && scenarioDefinitions[candidate.scenarioId]
      ? candidate.scenarioId
      : "skirmish";
  const tiles = candidate.tiles
    .map(sanitizeTile)
    .filter((tile): tile is CustomMapTilePlan => tile !== null);
  const name = (typeof candidate.name === "string" ? candidate.name : "").trim().slice(0, MAX_MAP_NAME_LENGTH);
  const id = typeof candidate.id === "string" && candidate.id.length > 0 ? candidate.id : newSharedMapId();
  const preset = sanitizeCustomMapPreset(candidate.preset);
  return {
    id,
    name: name.length > 0 ? name : "Unnamed map",
    scenarioId,
    players: clampMapPlayers(scenarioId, candidate.players),
    tiles,
    ...(preset ? { preset } : {}),
    createdByClientId:
      typeof candidate.createdByClientId === "string" ? candidate.createdByClientId.slice(0, 64) : null,
    createdByName: typeof candidate.createdByName === "string" ? candidate.createdByName.slice(0, 40) : null,
    createdAt:
      typeof candidate.createdAt === "number" && Number.isFinite(candidate.createdAt) && candidate.createdAt > 0
        ? candidate.createdAt
        : now,
    updatedAt: now
  };
}

/**
 * The shared map library: an id-keyed set of records with newest-saved-first
 * ordering and a hard cap. Both backends are thin wrappers — the PartyKit maps
 * Durable Object persists `records()` to storage, the Node store to a JSON file —
 * so the catalog looks identical on either transport.
 */
export class MapRegistry {
  private readonly maps = new Map<string, SharedMapRecord>();

  constructor(records: Iterable<SharedMapRecord> = []) {
    for (const record of records) {
      if (record && typeof record.id === "string" && record.id.length > 0) {
        this.maps.set(record.id, record);
      }
    }
  }

  /**
   * Inserts or overwrites a map (keyed by id — editing reuses the same id, so it
   * never duplicates). Evicts the oldest-touched maps once the catalog exceeds
   * {@link MAX_STORED_MAPS}. Returns the stored record.
   */
  upsert(record: SharedMapRecord): SharedMapRecord {
    this.maps.set(record.id, record);
    if (this.maps.size > MAX_STORED_MAPS) {
      const oldestFirst = [...this.maps.values()].sort((left, right) => left.updatedAt - right.updatedAt);
      for (const stale of oldestFirst.slice(0, this.maps.size - MAX_STORED_MAPS)) {
        this.maps.delete(stale.id);
      }
    }
    return record;
  }

  /** Removes a map. Returns whether it was present. */
  remove(id: string): boolean {
    return this.maps.delete(id);
  }

  get(id: string): SharedMapRecord | undefined {
    return this.maps.get(id);
  }

  has(id: string): boolean {
    return this.maps.has(id);
  }

  get size(): number {
    return this.maps.size;
  }

  /** The library, newest-saved first (the order the designer / picker show). */
  list(): SharedMapRecord[] {
    return [...this.maps.values()].sort((left, right) => right.updatedAt - left.updatedAt);
  }

  /** The raw records, for persistence to storage. */
  records(): SharedMapRecord[] {
    return [...this.maps.values()];
  }
}

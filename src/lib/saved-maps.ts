import type { CustomMapTilePlan } from "@/engine";

/**
 * Saved map designs, kept in this browser's localStorage. Maps are created
 * in the standalone map designer (/designer) and picked during map setup —
 * the lobby then syncs the chosen design's tiles to every seat through the
 * normal action stream, so only the designing player needs the saved copy.
 */

export type SavedMapRecord = {
  id: string;
  name: string;
  scenarioId: string;
  tiles: CustomMapTilePlan[];
  updatedAt: number;
};

const STORAGE_KEY = "homm3bg.saved-maps.v1";

function sanitizeTile(tile: unknown): CustomMapTilePlan | null {
  if (!tile || typeof tile !== "object") {
    return null;
  }
  const candidate = tile as Partial<CustomMapTilePlan>;
  if (!Number.isInteger(candidate.row) || !Number.isInteger(candidate.col)) {
    return null;
  }
  if (candidate.group !== "far" && candidate.group !== "near" && candidate.group !== "center") {
    return null;
  }
  return {
    row: candidate.row as number,
    col: candidate.col as number,
    group: candidate.group,
    faceDown: Boolean(candidate.faceDown),
    ...(typeof candidate.tileDefId === "string" ? { tileDefId: candidate.tileDefId } : {}),
    ...(Number.isInteger(candidate.rotation) ? { rotation: ((candidate.rotation as number) % 6 + 6) % 6 } : {})
  };
}

function sanitizeRecord(record: unknown): SavedMapRecord | null {
  if (!record || typeof record !== "object") {
    return null;
  }
  const candidate = record as Partial<SavedMapRecord>;
  if (typeof candidate.id !== "string" || typeof candidate.name !== "string" || !Array.isArray(candidate.tiles)) {
    return null;
  }
  return {
    id: candidate.id,
    name: candidate.name.slice(0, 48),
    scenarioId: typeof candidate.scenarioId === "string" ? candidate.scenarioId : "skirmish",
    tiles: candidate.tiles.map(sanitizeTile).filter((tile): tile is CustomMapTilePlan => tile !== null),
    updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : 0
  };
}

export function listSavedMaps(): SavedMapRecord[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map(sanitizeRecord)
      .filter((record): record is SavedMapRecord => record !== null)
      .sort((left, right) => right.updatedAt - left.updatedAt);
  } catch {
    return [];
  }
}

function persist(records: SavedMapRecord[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

/** Inserts or updates (by id) a saved map and returns the fresh list. */
export function saveMapRecord(record: Omit<SavedMapRecord, "updatedAt">): SavedMapRecord[] {
  const records = listSavedMaps().filter((existing) => existing.id !== record.id);
  records.unshift({ ...record, updatedAt: Date.now() });
  persist(records);
  return records;
}

export function deleteSavedMap(id: string): SavedMapRecord[] {
  const records = listSavedMaps().filter((existing) => existing.id !== id);
  persist(records);
  return records;
}

export function newSavedMapId(): string {
  return `map_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

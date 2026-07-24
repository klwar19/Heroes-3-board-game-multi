"use client";

import { getIdentity } from "@/lib/identity";

const STORAGE_PREFIX = "homm3bg.single-player-saves:";

export type SavedSinglePlayerGame = {
  id: string;
  name: string;
  roomId: string;
  savedAt: number;
  round: number;
  version: number;
};

function storageKey(): string {
  const identity = getIdentity();
  return `${STORAGE_PREFIX}${identity.userId ? `user:${identity.userId}` : `client:${identity.clientId}`}`;
}

function readSaves(): SavedSinglePlayerGame[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey()) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((entry): entry is SavedSinglePlayerGame => {
      const candidate = entry as Partial<SavedSinglePlayerGame>;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.name === "string" &&
        typeof candidate.roomId === "string" &&
        typeof candidate.savedAt === "number" &&
        typeof candidate.round === "number" &&
        typeof candidate.version === "number"
      );
    });
  } catch {
    return [];
  }
}

function writeSaves(saves: SavedSinglePlayerGame[]): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(storageKey(), JSON.stringify(saves.slice(0, 12)));
  } catch {
    // Save slots are best-effort when browser storage is unavailable.
  }
}

export function loadSavedSinglePlayerGames(): SavedSinglePlayerGame[] {
  return readSaves().sort((left, right) => right.savedAt - left.savedAt);
}

export function saveSinglePlayerGame(
  name: string,
  roomId: string,
  round: number,
  version: number,
  existingId?: string
): SavedSinglePlayerGame {
  const saves = readSaves();
  const save: SavedSinglePlayerGame = {
    id: existingId ?? `solo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim().slice(0, 48) || "Solo game",
    roomId,
    savedAt: Date.now(),
    round,
    version
  };
  writeSaves([save, ...saves.filter((entry) => entry.id !== save.id && entry.roomId !== roomId)]);
  return save;
}

export function deleteSavedSinglePlayerGame(id: string): void {
  writeSaves(readSaves().filter((save) => save.id !== id));
}

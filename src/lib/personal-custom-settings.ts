"use client";

import { getIdentity } from "@/lib/identity";
import type { GameSetupOptions } from "@/engine";

const STORAGE_PREFIX = "homm3bg.personal-custom-settings:";

export type PersonalCustomSetting = {
  id: string;
  name: string;
  savedAt: number;
  options: GameSetupOptions;
};

function storageKey(): string {
  const identity = getIdentity();
  // Account identity survives tabs and reconnects; guests stay private to the
  // current tab, matching the app's seat identity rules.
  return `${STORAGE_PREFIX}${identity.userId ? `user:${identity.userId}` : `client:${identity.clientId}`}`;
}

function readSettings(): PersonalCustomSetting[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey()) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((entry): entry is PersonalCustomSetting => {
      const candidate = entry as Partial<PersonalCustomSetting>;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.name === "string" &&
        typeof candidate.savedAt === "number" &&
        Boolean(candidate.options && typeof candidate.options === "object")
      );
    });
  } catch {
    return [];
  }
}

function writeSettings(settings: PersonalCustomSetting[]): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(storageKey(), JSON.stringify(settings.slice(0, 20)));
  } catch {
    // Personal presets are best-effort when browser storage is unavailable.
  }
}

export function loadPersonalCustomSettings(): PersonalCustomSetting[] {
  return readSettings().sort((left, right) => right.savedAt - left.savedAt);
}

export function savePersonalCustomSetting(
  name: string,
  options: GameSetupOptions,
  existingId?: string
): PersonalCustomSetting {
  const settings = readSettings();
  const setting: PersonalCustomSetting = {
    id: existingId ?? `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim().slice(0, 48) || "Custom setup",
    savedAt: Date.now(),
    // A setup snapshot is plain JSON today. Cloning here prevents later UI
    // edits from mutating a preset that is already saved.
    options: JSON.parse(JSON.stringify(options)) as GameSetupOptions
  };
  writeSettings([setting, ...settings.filter((entry) => entry.id !== setting.id)]);
  return setting;
}

export function deletePersonalCustomSetting(id: string): void {
  writeSettings(readSettings().filter((entry) => entry.id !== id));
}

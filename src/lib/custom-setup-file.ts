import { ENGINE_SIGNATURE, type GameSetupOptions } from "@/engine";

/**
 * Personal "Custom setting" save/load — FILE based, per user request: the Save
 * button writes the lobby's current map + rules setup to a JSON file on the
 * player's own device, and Load opens a file picker to bring one back. Files
 * are inherently per-person (each player keeps their own), survive browser
 * data wipes, and can be shared deliberately by sending the file.
 *
 * Patch tolerance: the file carries the writing build's ENGINE_SIGNATURE as an
 * advisory stamp only — loading NEVER hard-fails on a mismatch. The applied
 * options go through the normal SET_GAME_OPTIONS pipeline, which ignores
 * unknown keys and validates every known field, so an option a later patch
 * removed is silently skipped and an invalid value is rejected with the
 * engine's own message instead of corrupting the lobby.
 */

export const CUSTOM_SETUP_FILE_KIND = "homm3bg-custom-setup";

export type CustomSetupFile = {
  kind: typeof CUSTOM_SETUP_FILE_KIND;
  formatVersion: 1;
  /** The ENGINE_SIGNATURE of the build that wrote the file (advisory). */
  engineSignature: string;
  savedAt: number;
  name: string;
  options: GameSetupOptions;
};

export type ParsedCustomSetup =
  | { ok: true; name: string; options: GameSetupOptions; sameEngineVersion: boolean }
  | { ok: false; reason: string };

/** The file payload for the CURRENT lobby options (customMode forced on). */
export function buildCustomSetupFile(options: GameSetupOptions, name: string): CustomSetupFile {
  return {
    kind: CUSTOM_SETUP_FILE_KIND,
    formatVersion: 1,
    engineSignature: ENGINE_SIGNATURE,
    savedAt: Date.now(),
    name: name.trim().slice(0, 48) || "Custom setup",
    // Deep-clone so later lobby edits can never mutate an already-built file
    // payload; a setup snapshot is plain JSON today.
    options: JSON.parse(JSON.stringify({ ...options, customMode: true })) as GameSetupOptions
  };
}

/** A safe download filename derived from the setup's name. */
export function customSetupFileName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${slug || "custom-setup"}.homm3bg-setup.json`;
}

/**
 * Parses a chosen file's text. Liberal in what it reports, strict in what it
 * forwards: only the `options` object ever reaches SET_GAME_OPTIONS, with
 * customMode forced on so the lobby lands in (and shows) Custom mode.
 */
export function parseCustomSetupFile(text: string): ParsedCustomSetup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "That file is not readable JSON." };
  }
  const candidate = raw as Partial<CustomSetupFile> | null;
  if (!candidate || typeof candidate !== "object" || candidate.kind !== CUSTOM_SETUP_FILE_KIND) {
    return { ok: false, reason: "That file is not a saved custom setting." };
  }
  const options = candidate.options;
  if (!options || typeof options !== "object" || Array.isArray(options) || typeof options.scenarioId !== "string") {
    return { ok: false, reason: "The saved setting carries no usable setup options." };
  }
  return {
    ok: true,
    name: typeof candidate.name === "string" && candidate.name.trim() ? candidate.name.trim() : "Custom setup",
    options: { ...(options as GameSetupOptions), customMode: true },
    sameEngineVersion: candidate.engineSignature === ENGINE_SIGNATURE
  };
}

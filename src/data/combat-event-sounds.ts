import type { GameEvent } from "@/engine";

/**
 * Combat board-event audio: an engine GameEvent type -> the /public/sounds
 * manifest key the table plays when that event arrives during a combat snapshot
 * (see app/page.tsx). Kept here as a tested data table so the player code and
 * the test agree on the key, mirroring map-sounds.ts. combat-event-sounds.test.ts
 * proves every key resolves to a real clip on disk.
 */
export const COMBAT_EVENT_SOUNDS: Partial<Record<GameEvent["type"], string>> = {
  // A Bulwark army crossing a Rune-Level threshold (earned in battle, or already
  // met by a Rune-Empowered starting pool) rings the rune-lock seal activation
  // clip (user-chosen) under the Rune Level burst that flies into the board.
  RUNE_LEVEL_REACHED: "effects/rune-level-seal"
};

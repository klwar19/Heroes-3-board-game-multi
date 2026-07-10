/**
 * UI-check helper: injects real permanent + ongoing card IDs onto a seated
 * player so the map card-tray boxes show real card art and effect text.
 *
 * Enabled via `?demoTray=1` on the room URL. Display/restore only — not a
 * normal game rule.
 */
import type { GameState, PlayerId } from "@/engine";

/** Demo permanent/ongoing inject is OFF — empty so the tray shows real game state only. */
export const DEMO_TRAY_PERMANENTS = [] as const;

export const DEMO_TRAY_ONGOING: {
  cardId: string;
  effectIds: string[];
  returnTo: "discard" | "hand" | "spellBook";
}[] = [];

export function seedDemoTrayCards(state: GameState, playerId: PlayerId): GameState {
  // No inject — return state unchanged so permanents/ongoing stay empty unless earned in play.
  void playerId;
  return state;
}

export function isDemoTrayEnabled(): boolean {
  // Disabled for clean layout checks (no fake permanents/ongoing).
  return false;
}

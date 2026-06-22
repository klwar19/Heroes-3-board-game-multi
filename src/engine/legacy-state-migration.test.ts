import { describe, expect, it } from "vitest";
import { createAdventureGameState, getLegalActions, getPlayerView } from "./index";
import { healLegacyPlayerFields } from "./adventure";
import type { GameState, PlayerId } from "./state";

/**
 * A game serialized BEFORE the Spell Book release has players with no
 * `spellBook` array. getPlayerView spreads it on every render
 * (`[...player.spellBook]`), so an undefined spellBook threw "can't access
 * property Symbol.iterator, spellBook is undefined" and stranded the player on
 * the crash screen for the rest of their in-progress game (a fresh game worked
 * because new players get the field). These tests pin the backfill + the
 * defensive read so that regression can't return.
 */

function adventure(): GameState {
  return createAdventureGameState({ seed: "legacy-migration", difficulty: "normal", rollFirstPlayer: false });
}

/** Strip a field a newer release added, mimicking an older serialized save. */
function dropSpellBooks(state: GameState): GameState {
  for (const player of Object.values(state.players)) {
    // @ts-expect-error — deliberately simulating a pre-Spell-Book save shape.
    delete player.spellBook;
  }
  return state;
}

describe("legacy state migration: missing spellBook", () => {
  it("getPlayerView does not throw and reports an empty Spell Book", () => {
    const state = dropSpellBooks(adventure());
    const viewer = state.turnOrder.find((id) => id !== "neutral") as PlayerId;

    expect(() => getPlayerView(state, viewer)).not.toThrow();
    const view = getPlayerView(state, viewer);
    expect(view.players[viewer].spellBook).toEqual([]);
    expect(view.players[viewer].spellBookCount).toBe(0);
  });

  it("getLegalActions does not throw for a save with no spellBook", () => {
    const state = dropSpellBooks(adventure());
    const viewer = state.turnOrder.find((id) => id !== "neutral") as PlayerId;
    expect(() => getLegalActions(state, viewer)).not.toThrow();
  });

  it("healLegacyPlayerFields backfills an empty array and is idempotent", () => {
    const state = dropSpellBooks(adventure());

    expect(healLegacyPlayerFields(state)).toBe(true);
    for (const player of Object.values(state.players)) {
      expect(player.spellBook).toEqual([]);
    }
    // Nothing left to fix on a healed (or already-current) state.
    expect(healLegacyPlayerFields(state)).toBe(false);
  });
});

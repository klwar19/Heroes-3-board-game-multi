import { describe, expect, it } from "vitest";
import { actionForfeitsStartOfTurnDraw } from "./utils";
import { applyAction, createAdventureGameState, createInitialGameState } from "@/engine";
import type { GameAction, GameState } from "@/engine";

/**
 * The map UI pops a "using this card forfeits your start-of-turn draw —
 * continue?" confirmation exactly when this predicate is true. It must fire for
 * a card USE by the seated player while the draw is still unspent, and stay
 * silent for movement, off-turn, in combat, or once the draw is gone — so the
 * prompt never blocks the wrong thing and never goes missing.
 */

function mapTurn(): GameState {
  let state = createAdventureGameState({ seed: "forfeit-ui", difficulty: "normal", rollFirstPlayer: false, spellBook: true });
  if (state.players.p1.needsHandRefresh) {
    state = applyAction(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] }).state;
  }
  state.activePlayerId = "p1";
  state.players.p1.canMulligan = true;
  state.players.p1.needsHandRefresh = false;
  return state;
}

const play: GameAction = { type: "PLAY_CARD", playerId: "p1", cardId: "spell.town_portal", target: { type: "none" } };
const stash: GameAction = { type: "MOVE_SPELL_TO_SPELL_BOOK", playerId: "p1", cardId: "spell.haste" };
const cast: GameAction = { type: "CAST_SPELL", playerId: "p1", cardId: "spell.magic_arrow", target: { type: "none" } };
const move: GameAction = { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:7:2" };

describe("actionForfeitsStartOfTurnDraw — when the draw-forfeit confirm pops", () => {
  it("fires for a card play / cast / Spell-Book stash by the seat that still holds its draw", () => {
    const state = mapTurn();
    expect(actionForfeitsStartOfTurnDraw(state, "p1", play)).toBe(true);
    expect(actionForfeitsStartOfTurnDraw(state, "p1", stash)).toBe(true);
    expect(actionForfeitsStartOfTurnDraw(state, "p1", cast)).toBe(true);
  });

  it("does NOT fire for movement (a move forfeits the draw too, but is warned by the banner, not the modal)", () => {
    const state = mapTurn();
    expect(actionForfeitsStartOfTurnDraw(state, "p1", move)).toBe(false);
  });

  it("does NOT fire once the draw is already spent", () => {
    const state = mapTurn();
    state.players.p1.canMulligan = false;
    expect(actionForfeitsStartOfTurnDraw(state, "p1", play)).toBe(false);
  });

  it("does NOT fire while the forced over-limit discard is pending (the engine blocks card use then anyway)", () => {
    const state = mapTurn();
    state.players.p1.needsHandRefresh = true;
    expect(actionForfeitsStartOfTurnDraw(state, "p1", play)).toBe(false);
  });

  it("does NOT fire off-turn (someone else is the active player)", () => {
    const state = mapTurn();
    state.activePlayerId = "p2";
    expect(actionForfeitsStartOfTurnDraw(state, "p1", play)).toBe(false);
  });

  it("does NOT fire in combat (the start-of-turn draw is a map-only step)", () => {
    const combat = createInitialGameState("forfeit-ui-combat");
    combat.activePlayerId = "p1";
    combat.players.p1.canMulligan = true;
    expect(combat.combat, "the fixture should be in combat").toBeTruthy();
    expect(actionForfeitsStartOfTurnDraw(combat, "p1", cast)).toBe(false);
  });
});

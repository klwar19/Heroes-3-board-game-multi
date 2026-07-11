import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, type GameAction, type GameState } from "./index";

// ---------------------------------------------------------------------------
// First-round rule: cards discarded during the opening hand refresh return to
// the BOTTOM of your OWN deck, not to the discard pile — an early mulligan must
// not strand cards in the discard for the whole first deck cycle. From round 2
// on, discards go to the discard pile as normal. Both directions are pinned
// here (the later-round case is the mutation CONTROL).
// ---------------------------------------------------------------------------

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

/** A fresh 2-player game with the active player's starting tile rotated, so the
 *  opening hand refresh (canMulligan) is available. */
function openedGame(seed: string): { state: GameState; active: string } {
  let state = createAdventureGameState({ seed, difficulty: "normal" });
  const active = state.activePlayerId;
  const pendingTile = state.adventure!.pendingTileChoice;
  expect(pendingTile?.kind).toBe("starting");
  state = apply(state, {
    type: "SET_TILE_ROTATION",
    playerId: active,
    tileInstanceId: pendingTile!.tileInstanceId,
    rotation: 0
  });
  return { state, active };
}

describe("First-round hand discard returns to the deck (bottom), not the discard pile", () => {
  it("round 1: a discarded card goes to the BOTTOM of the deck and is NOT redrawn", () => {
    const { state: opened, active } = openedGame("fr-discard-round1");
    expect(opened.round).toBe(1);

    const player = opened.players[active]!;
    player.hand = ["stat.attack", "stat.defense", "stat.power", "stat.knowledge"];
    player.deck = ["ability.luck"]; // the only card on top of the draw pile
    player.discard = [];

    const state = apply(opened, { type: "REFRESH_HAND", playerId: active, discardCardIds: ["stat.attack"] });

    // Drew the fresh top card, NOT the just-discarded stat.attack…
    expect(state.players[active]!.hand).toEqual(["stat.defense", "stat.power", "stat.knowledge", "ability.luck"]);
    // …because stat.attack went to the BOTTOM of the deck (index 0)…
    expect(state.players[active]!.deck).toEqual(["stat.attack"]);
    // …and the discard pile stays empty.
    expect(state.players[active]!.discard).toEqual([]);
  });

  it("control — a later round (round 3): the same discard goes to the discard pile", () => {
    const { state: opened, active } = openedGame("fr-discard-round3");

    // Move past the opening round; the rule only fires on round 1.
    opened.round = 3;
    const player = opened.players[active]!;
    player.canMulligan = true;
    player.needsHandRefresh = false;
    player.hand = ["stat.attack", "stat.defense", "stat.power", "stat.knowledge"];
    player.deck = ["ability.luck"];
    player.discard = [];

    const state = apply(opened, { type: "REFRESH_HAND", playerId: active, discardCardIds: ["stat.attack"] });

    expect(state.players[active]!.hand).toEqual(["stat.defense", "stat.power", "stat.knowledge", "ability.luck"]);
    // From round 2 on the discard behaves normally: card on the discard pile, deck emptied.
    expect(state.players[active]!.discard).toEqual(["stat.attack"]);
    expect(state.players[active]!.deck).toEqual([]);
  });
});

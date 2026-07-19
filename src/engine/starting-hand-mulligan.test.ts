import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, type GameAction, type GameState } from "./index";

// ---------------------------------------------------------------------------
// First-round hand Mulligan (GameSetupOptions.startingHandMulligan, default ON).
// ON  = current normal play: round-1 start-of-turn discards are allowed (cards
//       return to the bottom of your own deck).
// OFF = no discards at the beginning of round 1 — keep the opening hand
//       (draw-only if under the limit). Later rounds discard normally.
// Each claim fails if its wiring is removed; the OFF and later-round cases are
// CONTROLs.
// ---------------------------------------------------------------------------

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

function applyExpectError(state: GameState, action: GameAction): string {
  const result = applyAction(state, action);
  expect(result.errors.length, "expected a rejection").toBeGreaterThan(0);
  return result.errors.map((error) => error.message).join("; ");
}

/** A fresh 2-player game with the active player's starting tile rotated, so the
 *  opening hand step (canMulligan) is armed. */
function openedGame(seed: string, mode?: boolean): { state: GameState; active: string } {
  let state = createAdventureGameState({
    seed,
    difficulty: "normal",
    ...(mode !== undefined ? { startingHandMulligan: mode } : {})
  });
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

describe("First-round hand Mulligan", () => {
  it("defaults ON (current normal: round-1 discards allowed)", () => {
    const { state } = openedGame("shm-default-on");
    expect(state.adventure!.startingHandMulligan).toBe(true);

    const off = createAdventureGameState({
      seed: "shm-default-off",
      difficulty: "normal",
      startingHandMulligan: false
    });
    expect(off.adventure!.startingHandMulligan).toBe(false);
  });

  it("ON: round 1 may discard during the start-of-turn hand step (deck bottom)", () => {
    const { state: opened, active } = openedGame("shm-on-discard", true);
    expect(opened.round).toBe(1);
    const player = opened.players[active]!;
    player.hand = ["stat.attack", "stat.defense", "stat.power", "stat.knowledge"];
    player.deck = ["ability.luck"];
    player.discard = [];

    const state = apply(opened, {
      type: "REFRESH_HAND",
      playerId: active,
      discardCardIds: ["stat.attack"]
    });
    expect(state.players[active]!.hand).toEqual([
      "stat.defense",
      "stat.power",
      "stat.knowledge",
      "ability.luck"
    ]);
    expect(state.players[active]!.deck).toEqual(["stat.attack"]);
    expect(state.players[active]!.discard).toEqual([]);
  });

  it("OFF: round 1 rejects a start-of-turn discard (CONTROL)", () => {
    const { state: opened, active } = openedGame("shm-off-lock", false);
    expect(opened.adventure!.startingHandMulligan).toBe(false);
    expect(opened.round).toBe(1);
    const player = opened.players[active]!;
    player.hand = ["stat.attack", "stat.defense", "stat.power", "stat.knowledge"];
    player.deck = ["ability.luck"];
    player.discard = [];
    player.canMulligan = true;
    player.needsHandRefresh = false;

    const message = applyExpectError(opened, {
      type: "REFRESH_HAND",
      playerId: active,
      discardCardIds: ["stat.attack"]
    });
    expect(message).toMatch(/First-round hand discards are off/i);
    // Hand unchanged — the reject is whole-action.
    expect(opened.players[active]!.hand).toEqual([
      "stat.attack",
      "stat.defense",
      "stat.power",
      "stat.knowledge"
    ]);
  });

  it("OFF: round 1 still allows draw-only (empty discard list)", () => {
    const { state: opened, active } = openedGame("shm-off-draw", false);
    const player = opened.players[active]!;
    player.hand = ["stat.attack", "stat.defense", "stat.power"];
    player.deck = ["ability.luck"];
    player.discard = [];

    const state = apply(opened, {
      type: "REFRESH_HAND",
      playerId: active,
      discardCardIds: []
    });
    expect(state.players[active]!.hand).toContain("ability.luck");
    expect(state.players[active]!.canMulligan).toBe(false);
  });

  it("CONTROL — a later round discards normally even when the option is off", () => {
    const { state: opened, active } = openedGame("shm-later-round", false);
    opened.round = 3;
    const player = opened.players[active]!;
    player.canMulligan = true;
    player.needsHandRefresh = false;
    player.hand = ["stat.attack", "stat.defense", "stat.power", "stat.knowledge"];
    player.deck = ["ability.luck"];
    player.discard = [];

    const state = apply(opened, {
      type: "REFRESH_HAND",
      playerId: active,
      discardCardIds: ["stat.attack"]
    });
    expect(state.players[active]!.discard).toEqual(["stat.attack"]);
    expect(state.players[active]!.deck).toEqual([]);
  });
});

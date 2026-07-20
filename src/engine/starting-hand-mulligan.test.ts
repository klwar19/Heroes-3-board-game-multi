import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions, type GameAction, type GameState } from "./index";

// ---------------------------------------------------------------------------
// First-round hand Mulligan (GameSetupOptions.startingHandMulligan, default ON).
//
// BOTH modes share the same R1 fill-to-limit step:
//   - Difficulty starting-bonus artifact(s) may already be in hand (under limit).
//   - You may ditch those under-limit cards or keep them, then draw up to 4.
//   - A FULL opening hand (pre-dealt 4, no bonus) may NOT dump cards on fill.
//
// OFF  = stop after fill. No second pass.
// ON   = after fill, OPENING_HAND_MULLIGAN: discard 0–N to deck bottom, draw
//        the same number (empty = keep).
// Later rounds: unrestricted discard-then-draw-to-limit on REFRESH_HAND.
// Each claim fails if its wiring is removed.
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

describe("First-round hand Mulligan — setup flag", () => {
  it("defaults ON", () => {
    const { state } = openedGame("shm-default-on");
    expect(state.adventure!.startingHandMulligan).toBe(true);

    const off = createAdventureGameState({
      seed: "shm-default-off",
      difficulty: "normal",
      startingHandMulligan: false
    });
    expect(off.adventure!.startingHandMulligan).toBe(false);
  });
});

describe("Round-1 fill-to-limit (both ON and OFF)", () => {
  it("OFF: may discard under-limit bonus card(s), then draw up to the limit", () => {
    const { state: opened, active } = openedGame("shm-off-bonus", false);
    expect(opened.round).toBe(1);
    const player = opened.players[active]!;
    // Difficulty bonus path: one artifact already in hand, under the limit.
    player.hand = ["artifact.centaurs_axe"];
    player.deck = ["stat.attack", "stat.defense", "stat.power", "stat.knowledge", "ability.luck"];
    player.discard = [];
    player.canMulligan = true;
    player.needsHandRefresh = false;
    player.canOpeningMulligan = false;

    // Ditch the bonus artifact, then fill to 4.
    const state = apply(opened, {
      type: "REFRESH_HAND",
      playerId: active,
      discardCardIds: ["artifact.centaurs_axe"]
    });
    expect(state.players[active]!.hand).toHaveLength(4);
    expect(state.players[active]!.deck[0]).toBe("artifact.centaurs_axe"); // bottom
    expect(state.players[active]!.canMulligan).toBe(false);
    // OFF: no second pass.
    expect(state.players[active]!.canOpeningMulligan).toBeFalsy();
  });

  it("OFF: full opening hand may NOT dump cards on fill (CONTROL)", () => {
    const { state: opened, active } = openedGame("shm-off-full", false);
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
    expect(message).toMatch(/keep your full opening hand|Mulligan is off/i);
  });

  it("OFF: full hand may only draw-empty (acknowledge / no-op if already full)", () => {
    const { state: opened, active } = openedGame("shm-off-draw-full", false);
    const player = opened.players[active]!;
    player.hand = ["stat.attack", "stat.defense", "stat.power", "stat.knowledge"];
    player.deck = ["ability.luck"];
    player.canMulligan = true;
    player.needsHandRefresh = false;

    const state = apply(opened, {
      type: "REFRESH_HAND",
      playerId: active,
      discardCardIds: []
    });
    expect(state.players[active]!.hand).toEqual([
      "stat.attack",
      "stat.defense",
      "stat.power",
      "stat.knowledge"
    ]);
    expect(state.players[active]!.canMulligan).toBe(false);
    expect(state.players[active]!.canOpeningMulligan).toBeFalsy();
  });

  it("ON: fill with under-limit discard still arms the opening Mulligan", () => {
    const { state: opened, active } = openedGame("shm-on-bonus", true);
    const player = opened.players[active]!;
    player.hand = ["artifact.centaurs_axe"];
    player.deck = ["stat.attack", "stat.defense", "stat.power", "stat.knowledge"];
    player.canMulligan = true;
    player.needsHandRefresh = false;

    const state = apply(opened, {
      type: "REFRESH_HAND",
      playerId: active,
      discardCardIds: [] // keep the bonus, draw 3 more
    });
    expect(state.players[active]!.hand).toHaveLength(4);
    expect(state.players[active]!.hand).toContain("artifact.centaurs_axe");
    expect(state.players[active]!.canOpeningMulligan).toBe(true);
  });

  it("ON: full-hand dump on fill is rejected — use OPENING_HAND_MULLIGAN after (CONTROL)", () => {
    const { state: opened, active } = openedGame("shm-on-no-dump", true);
    const player = opened.players[active]!;
    player.hand = ["stat.attack", "stat.defense", "stat.power", "stat.knowledge"];
    player.deck = ["ability.luck", "ability.estates"];
    player.canMulligan = true;
    player.needsHandRefresh = false;

    const message = applyExpectError(opened, {
      type: "REFRESH_HAND",
      playerId: active,
      discardCardIds: ["stat.attack"]
    });
    expect(message).toMatch(/Fill your hand first|Mulligan cards from the full hand/i);
  });
});

describe("ON — OPENING_HAND_MULLIGAN second pass", () => {
  function filledForMulligan(seed: string): { state: GameState; active: string } {
    const { state: opened, active } = openedGame(seed, true);
    const player = opened.players[active]!;
    player.hand = ["stat.attack", "stat.defense", "stat.power", "stat.knowledge"];
    player.deck = ["ability.luck", "ability.estates", "spell.magic_arrow"];
    player.discard = [];
    player.canMulligan = true;
    player.needsHandRefresh = false;
    // Fill step (empty discard — hand already full).
    const state = apply(opened, {
      type: "REFRESH_HAND",
      playerId: active,
      discardCardIds: []
    });
    expect(state.players[active]!.canOpeningMulligan).toBe(true);
    return { state, active };
  }

  it("keeps the hand when discard list is empty", () => {
    const { state: filled, active } = filledForMulligan("shm-on-keep");
    const before = [...filled.players[active]!.hand];
    const state = apply(filled, {
      type: "OPENING_HAND_MULLIGAN",
      playerId: active,
      discardCardIds: []
    });
    expect(state.players[active]!.hand).toEqual(before);
    expect(state.players[active]!.canOpeningMulligan).toBe(false);
  });

  it("discards N to deck bottom and draws N (same count)", () => {
    const { state: filled, active } = filledForMulligan("shm-on-redraw");
    const state = apply(filled, {
      type: "OPENING_HAND_MULLIGAN",
      playerId: active,
      discardCardIds: ["stat.attack", "stat.defense"]
    });
    expect(state.players[active]!.hand).toHaveLength(4);
    expect(state.players[active]!.hand).not.toContain("stat.attack");
    expect(state.players[active]!.hand).not.toContain("stat.defense");
    // Discarded cards sit at the bottom of the deck (not redrawn).
    expect(state.players[active]!.deck.slice(0, 2)).toEqual(
      expect.arrayContaining(["stat.attack", "stat.defense"])
    );
    expect(state.players[active]!.canOpeningMulligan).toBe(false);
  });

  it("is offered alongside map play (optional — you CAN mulligan, not must)", () => {
    const { state: filled, active } = filledForMulligan("shm-on-optional");
    const offers = getLegalActions(filled, active);
    expect(offers.some((legal) => legal.action.type === "OPENING_HAND_MULLIGAN")).toBe(true);
    // Not a hard gate: movement / play remain available (unlike canMulligan fill).
    expect(offers.some((legal) => legal.action.type === "END_TURN")).toBe(true);
  });

  it("OFF never arms canOpeningMulligan (CONTROL)", () => {
    const { state: opened, active } = openedGame("shm-off-no-arm", false);
    const player = opened.players[active]!;
    player.hand = ["stat.attack", "stat.defense", "stat.power"];
    player.deck = ["stat.knowledge"];
    player.canMulligan = true;
    const state = apply(opened, {
      type: "REFRESH_HAND",
      playerId: active,
      discardCardIds: []
    });
    expect(state.players[active]!.hand).toHaveLength(4);
    expect(state.players[active]!.canOpeningMulligan).toBeFalsy();
    // Handler-validated: rejects when the window is not armed / option off.
    const message = applyExpectError(state, {
      type: "OPENING_HAND_MULLIGAN",
      playerId: active,
      discardCardIds: []
    });
    expect(message).toMatch(/not available|off for this game|Opening hand Mulligan/i);
  });
});

describe("Later-round CONTROL", () => {
  it("a later round discards freely even when the option is off", () => {
    const { state: opened, active } = openedGame("shm-later-round", false);
    opened.round = 3;
    const player = opened.players[active]!;
    player.canMulligan = true;
    player.needsHandRefresh = false;
    player.canOpeningMulligan = false;
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
    expect(state.players[active]!.canOpeningMulligan).toBeFalsy();
  });
});

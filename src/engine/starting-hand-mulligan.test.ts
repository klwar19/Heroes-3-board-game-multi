import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, type GameAction, type GameState } from "./index";
import { getLegalActions } from "./legal-actions";

// ---------------------------------------------------------------------------
// First-round starting-hand Mulligan mode (GameSetupOptions.startingHandMulligan,
// default OFF). In ROUND 1 only, AFTER the mandatory start-of-turn draw, a player
// may replace up to FIRST_ROUND_MULLIGAN_LIMIT (4) cards — one at a time
// (MULLIGAN_CARD: discard one to the bottom of your own deck, draw one) — until
// the budget runs out. Each claim fails if its wiring is removed; the mode-off,
// round-2 and pre-draw cases are the CONTROLs.
// ---------------------------------------------------------------------------

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

/** A fresh 2-player game with the active player's starting tile rotated, so the
 *  opening hand step (canMulligan) — and, with the mode on, the round-1 Mulligan
 *  budget — are armed. */
function openedGame(seed: string, mode = true): { state: GameState; active: string } {
  let state = createAdventureGameState({ seed, difficulty: "normal", startingHandMulligan: mode });
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

/** Take the mandatory start-of-turn draw (draw new, no discards). */
function takeMandatoryDraw(state: GameState, active: string): GameState {
  return apply(state, { type: "REFRESH_HAND", playerId: active, discardCardIds: [] });
}

describe("First-round starting-hand Mulligan", () => {
  it("freezes the option and seeds the round-1 budget (CONTROL: absent by default)", () => {
    const { state, active } = openedGame("shm-freeze");
    expect(state.adventure!.startingHandMulligan).toBe(true);
    // The budget is seeded at turn start (before the mandatory draw is taken).
    expect(state.players[active]!.firstRoundMulligansLeft).toBe(4);

    const off = createAdventureGameState({ seed: "shm-freeze-off", difficulty: "normal" });
    expect(off.adventure!.startingHandMulligan ?? false).toBe(false);
  });

  it("round 1: replaces a card (to deck bottom, draws the top), up to 4, then stops", () => {
    const { state: opened, active } = openedGame("shm-basic");
    expect(opened.round).toBe(1);
    let state = takeMandatoryDraw(opened, active);
    const player = () => state.players[active]!;
    // The mandatory draw is spent; the replacement budget stands at 4.
    expect(player().canMulligan).toBe(false);
    expect(player().needsHandRefresh ?? false).toBe(false);
    expect(player().firstRoundMulligansLeft).toBe(4);

    // Deterministic hand/deck for the replacement.
    player().hand = ["stat.attack", "stat.defense", "stat.power", "stat.knowledge"];
    player().deck = ["ability.luck"];
    player().discard = [];

    // MULLIGAN_CARD is offered for each hand card.
    const offers = getLegalActions(state, active).map((legal) => legal.action);
    expect(offers.some((action) => action.type === "MULLIGAN_CARD" && action.cardId === "stat.attack")).toBe(true);

    // Replace stat.attack: it goes to the BOTTOM of the deck; draw the top card…
    state = apply(state, { type: "MULLIGAN_CARD", playerId: active, cardId: "stat.attack" });
    expect(player().hand).toEqual(["stat.defense", "stat.power", "stat.knowledge", "ability.luck"]);
    expect(player().deck).toEqual(["stat.attack"]);
    // …never onto the discard pile (the round-1 rule), and one replacement spent.
    expect(player().discard).toEqual([]);
    expect(player().firstRoundMulligansLeft).toBe(3);

    // Spend the remaining three replacements.
    for (let i = 0; i < 3; i += 1) {
      state = apply(state, { type: "MULLIGAN_CARD", playerId: active, cardId: player().hand[0] });
    }
    expect(player().firstRoundMulligansLeft).toBe(0);

    // A fifth replacement is rejected, and none is offered any more.
    const fifth = applyAction(state, { type: "MULLIGAN_CARD", playerId: active, cardId: player().hand[0] });
    expect(fifth.errors.length).toBeGreaterThan(0);
    expect(getLegalActions(state, active).some((legal) => legal.action.type === "MULLIGAN_CARD")).toBe(false);
  });

  it("CONTROL: with the mode OFF no replacement is offered or accepted", () => {
    const { state: opened, active } = openedGame("shm-off", false);
    const state = takeMandatoryDraw(opened, active);
    expect(state.players[active]!.firstRoundMulligansLeft ?? 0).toBe(0);
    state.players[active]!.hand = ["stat.attack", "stat.defense"];
    state.players[active]!.deck = ["ability.luck"];
    expect(getLegalActions(state, active).some((legal) => legal.action.type === "MULLIGAN_CARD")).toBe(false);
    const rejected = applyAction(state, { type: "MULLIGAN_CARD", playerId: active, cardId: "stat.attack" });
    expect(rejected.errors.length).toBeGreaterThan(0);
  });

  it("CONTROL: only in round 1 — a later round offers no replacement even with budget", () => {
    const { state: opened, active } = openedGame("shm-round2");
    const state = takeMandatoryDraw(opened, active);
    state.round = 2;
    state.players[active]!.firstRoundMulligansLeft = 4;
    state.players[active]!.hand = ["stat.attack"];
    state.players[active]!.deck = ["ability.luck"];
    expect(getLegalActions(state, active).some((legal) => legal.action.type === "MULLIGAN_CARD")).toBe(false);
    const rejected = applyAction(state, { type: "MULLIGAN_CARD", playerId: active, cardId: "stat.attack" });
    expect(rejected.errors.length).toBeGreaterThan(0);
  });

  it("CONTROL: unavailable until the mandatory start-of-turn draw is taken", () => {
    const { state: opened, active } = openedGame("shm-pre");
    // The mandatory draw is still pending (canMulligan), so no replacement yet.
    expect(opened.players[active]!.canMulligan).toBe(true);
    expect(getLegalActions(opened, active).some((legal) => legal.action.type === "MULLIGAN_CARD")).toBe(false);
    const rejected = applyAction(opened, {
      type: "MULLIGAN_CARD",
      playerId: active,
      cardId: opened.players[active]!.hand[0] ?? "stat.attack"
    });
    expect(rejected.errors.length).toBeGreaterThan(0);
  });
});

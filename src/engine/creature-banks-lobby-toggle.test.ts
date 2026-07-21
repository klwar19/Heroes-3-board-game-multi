import { describe, expect, it } from "vitest";
import { applyAction } from "./reducer";
import { createAdventureLobbyState } from "./adventure-setup";
import type { GameAction, GameState } from "./state";

/**
 * Creature Banks lobby toggle (Map tab). The lobby button dispatches
 * SET_GAME_OPTIONS with `creatureBanks`, and the started game must honour it —
 * the presence/absence of the two bank token piles (creatureBankTokensFar /
 * creatureBankTokensNear) IS the on/off switch (a discovered Far/Near tile with a
 * Blocked Field can only offer a bank when its pile exists), so these tests
 * assert the OBSERVABLE built-game outcome, not just the stored option.
 *
 * Regression: `setGameOptions` had no `creatureBanks` branch and
 * `buildAdventureFromLobby` never forwarded it, so a host's "Off" click was
 * silently dropped and every game built with banks on regardless.
 */

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

/** Seat p1 Castle + p2 Necropolis and start the adventure. */
function startGame(state: GameState): GameState {
  let next = apply(state, { type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "catherine" });
  next = apply(next, { type: "CHOOSE_FACTION", playerId: "p2", factionId: "necropolis", heroDefId: "sandro" });
  return apply(next, { type: "START_ADVENTURE", playerId: "p1" });
}

describe("Creature Banks lobby toggle", () => {
  it("turning Creature Banks OFF in the lobby builds a game with NO bank token piles", () => {
    let state = createAdventureLobbyState({ seed: "cb-off" });
    state = apply(state, { type: "SET_GAME_OPTIONS", playerId: "p1", options: { creatureBanks: false } });

    // The Off click is stored on the lobby options and announced like a sibling.
    expect(state.setupLobby?.options.creatureBanks).toBe(false);
    const optionEvent = state.eventLog.find(
      (event) => event.type === "GAME_OPTIONS_CHANGED" && event.message?.includes("Creature Banks off")
    );
    expect(optionEvent, "SET_GAME_OPTIONS should announce 'Creature Banks off'").toBeDefined();

    // Observable outcome: the started game carries neither bank pile — the piles'
    // absence IS the off switch (no bank can be offered on tile discovery).
    const started = startGame(state);
    expect(started.phase).toBe("player-turn");
    expect(started.adventure!.creatureBankTokensFar).toBeUndefined();
    expect(started.adventure!.creatureBankTokensNear).toBeUndefined();
  });

  it("CONTROL: a lobby that never touches the toggle builds WITH both bank piles (default on)", () => {
    const started = startGame(createAdventureLobbyState({ seed: "cb-default" }));

    expect(started.phase).toBe("player-turn");
    expect(started.adventure!.creatureBankTokensFar?.length ?? 0).toBeGreaterThan(0);
    expect(started.adventure!.creatureBankTokensNear?.length ?? 0).toBeGreaterThan(0);
  });

  it("CONTROL: explicitly turning Creature Banks ON stores true and builds WITH both piles", () => {
    let state = createAdventureLobbyState({ seed: "cb-on" });
    state = apply(state, { type: "SET_GAME_OPTIONS", playerId: "p1", options: { creatureBanks: true } });

    expect(state.setupLobby?.options.creatureBanks).toBe(true);
    const optionEvent = state.eventLog.find(
      (event) => event.type === "GAME_OPTIONS_CHANGED" && event.message?.includes("Creature Banks on")
    );
    expect(optionEvent, "SET_GAME_OPTIONS should announce 'Creature Banks on'").toBeDefined();

    const started = startGame(state);
    expect(started.adventure!.creatureBankTokensFar?.length ?? 0).toBeGreaterThan(0);
    expect(started.adventure!.creatureBankTokensNear?.length ?? 0).toBeGreaterThan(0);
  });
});

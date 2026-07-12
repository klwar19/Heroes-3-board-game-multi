// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PromptTray } from "./screen";
import { applyAction, createAdventureGameState, getLegalActions, getMainHero } from "@/engine";
import { startNeutralEncounter } from "@/engine/adventure-reducer";
import { NECROMANCY_ABILITY_ID } from "@/engine/ruleset";
import { NEUTRAL_PLAYER_ID } from "@/engine/state";
import type { GameAction, GameState } from "@/engine";

afterEach(cleanup);

function apply(state: GameState, action: GameAction): GameState {
  const r = applyAction(state, action);
  expect(r.errors.map((e) => e.message)).toEqual([]);
  return r.state;
}

/**
 * Real post-combat state: a Necropolis hero holding a Necromancy card fights a
 * neutral guard and wins. Winning opens the now-or-never after-combat Necromancy
 * window (pendingNecromancy) — play the reinforce, or skip. The hero is level 7
 * vs a difficulty-7 guard so the win adds no level (no Ability search / Learning),
 * leaving the Necromancy window as the ONLY thing pending — exactly the state
 * where the map offered no Skip button.
 */
function necromancyWindowState(seed: string): GameState {
  const state = createAdventureGameState({
    seed,
    ruleset: "binh",
    difficulty: "easy",
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "One", factionId: "necropolis" as never, heroDefId: "sandro" },
      { id: "p2", name: "Two", factionId: "rampart" as never }
    ]
  });
  for (const p of Object.values(state.players)) {
    p.canMulligan = false;
    p.needsHandRefresh = false;
  }

  // Hold Necromancy in hand (not a deck-drawn copy) so the after-combat window opens.
  state.players.p1.hand = [NECROMANCY_ABILITY_ID];
  state.players.p1.deckDrawnAbilityCardIds = [];

  const hero = getMainHero(state, "p1")!;
  hero.level = 7;
  hero.spaceId = "guard-field";
  hero.movementPoints = 0;
  state.adventure!.fields["guard-field"] = {
    spaceId: "guard-field",
    tileInstanceId: "t",
    slot: 0,
    location: "mine",
    difficulty: 7,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };

  let s = state;
  startNeutralEncounter(s, hero, s.adventure!.fields["guard-field"]);
  let place = getLegalActions(s, "p1").find((a) => a.action.type === "PLACE_COMBAT_UNIT");
  while (place) {
    s = apply(s, place.action);
    place = getLegalActions(s, "p1").find((a) => a.action.type === "PLACE_COMBAT_UNIT");
  }
  s = apply(s, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });

  // Force the fought-win end state: every guard dies, the winner's army survives.
  for (const unit of Object.values(s.combat!.units)) {
    if (unit.controllerId === NEUTRAL_PLAYER_ID) {
      unit.damage = unit.maxHealth;
    }
  }
  s.combat!.outcome = {
    winnerPlayerId: "p1",
    defeatedPlayerId: NEUTRAL_PLAYER_ID,
    reason: "all-enemy-units-defeated"
  };
  s.combat!.endAcknowledged = false;
  s = apply(s, { type: "ACKNOWLEDGE_COMBAT_END", playerId: "p1" });
  return s;
}

describe("Necropolis — post-combat Necromancy window renders on the map", () => {
  it("opens a real Necromancy window that offers BOTH a play and a Skip", () => {
    const state = necromancyWindowState("necro-open");
    // The engine really opened the window and gated the turn behind it.
    expect(state.adventure?.pendingNecromancy?.playerId).toBe("p1");
    const legal = getLegalActions(state, "p1");
    expect(legal.some((a) => a.action.type === "SKIP_NECROMANCY")).toBe(true);
    expect(
      legal.some(
        (a) => a.action.type === "PLAY_CARD" && a.action.cardId === NECROMANCY_ABILITY_ID
      )
    ).toBe(true);
    // Nothing else on the map is legal yet (no End turn / Move).
    expect(legal.some((a) => a.action.type === "END_TURN")).toBe(false);
  });

  it("PromptTray renders the Skip Necromancy button and dispatches it (the bug: it was forced)", () => {
    const state = necromancyWindowState("necro-render");
    const onAction = vi.fn();
    render(
      <PromptTray legalActions={getLegalActions(state, "p1")} onAction={onAction} state={state} viewerPlayerId="p1" />
    );

    // Without the fix the tray returns null (no surface claimed the Necromancy
    // window) so the winner was forced to play the reinforce card — there was no
    // way to skip. The Skip button must be present AND functional.
    const skip = screen.getByRole("button", { name: /skip necromancy/i });
    expect(skip).toBeTruthy();
    // The reinforce play is offered alongside it, so the choice is real.
    expect(screen.getByRole("button", { name: /play necromancy/i })).toBeTruthy();

    fireEvent.click(skip);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toMatchObject({ type: "SKIP_NECROMANCY", playerId: "p1" });
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PromptTray } from "./screen";
import { applyAction, createAdventureGameState, getLegalActions, getMainHero } from "@/engine";
import { finalizeAdventureCombat, pumpAdventureQueues, startNeutralEncounter } from "@/engine/adventure-reducer";
import { NECROMANCY_ABILITY_ID } from "@/engine/ruleset";
import { NEUTRAL_PLAYER_ID } from "@/engine/state";
import type { CombatState, MapFieldState } from "@/engine/state";
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

  // Hold Necromancy in hand so the after-combat window opens (a Necropolis hero
  // may play any copy, deck-drawn or not — wiki p.24; the empty list is a neutral
  // baseline, not a gate).
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

  it("PromptTray renders the explicit Resolve button and dispatches it", () => {
    const state = necromancyWindowState("necro-render");
    const onAction = vi.fn();
    render(
      <PromptTray legalActions={getLegalActions(state, "p1")} onAction={onAction} state={state} viewerPlayerId="p1" />
    );

    // Without the prompt surface the winner was frozen after combat. The
    // explicit Resolve control must be present and functional.
    const skip = screen.getByRole("button", { name: /resolve bonuses and continue/i });
    expect(skip).toBeTruthy();
    // The reinforce play is offered alongside it, so the choice is real.
    expect(screen.getByRole("button", { name: /play necromancy/i })).toBeTruthy();

    fireEvent.click(skip);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toMatchObject({ type: "SKIP_NECROMANCY", playerId: "p1" });
  });

  /**
   * The USER-REPORTED shape: after a Creature Bank fight (Derelict Ship under
   * Polish Bank Sizes) whose reward will open a Spell-deck Search, the map
   * screen must render Necromancy before that Search can start. Combat is
   * already cleared, so PromptTray must own this interaction.
   */
  function derelictBankNecromancyState(seed: string): GameState {
    const state = createAdventureGameState({
      seed,
      ruleset: "binh",
      difficulty: "normal",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "One", factionId: "necropolis" as never, heroDefId: "sandro" },
        { id: "p2", name: "Two", factionId: "castle" as never }
      ]
    });
    for (const p of Object.values(state.players)) {
      p.canMulligan = false;
      p.needsHandRefresh = false;
    }
    state.players.p1.hand = [NECROMANCY_ABILITY_ID];
    state.players.p1.deckDrawnAbilityCardIds = [];
    state.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "few" }];
    state.players.p1.resources.gold = 20;

    const hero = getMainHero(state, "p1")!;
    hero.level = 7;
    hero.spaceId = "bank-field";
    state.adventure!.fields["bank-field"] = {
      spaceId: "bank-field",
      tileInstanceId: "t",
      slot: 0,
      location: "creature_bank",
      bankId: "derelict_ship",
      bankSize: 2,
      difficulty: 1,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    } as MapFieldState;
    state.activePlayerId = "p1";
    state.combat = {
      context: {
        kind: "neutral",
        heroId: hero.id,
        fieldId: "bank-field",
        difficulty: 1,
        hasAzure: false,
        bankId: "derelict_ship",
        bankStackCount: 2
      },
      outcome: { winnerPlayerId: "p1", defeatedPlayerId: NEUTRAL_PLAYER_ID, reason: "all-enemy-units-defeated" },
      units: {}
    } as unknown as CombatState;

    finalizeAdventureCombat(state);
    pumpAdventureQueues(state);
    return state;
  }

  it("renders Necromancy before a Bank reward may open its Spell Search", () => {
    const state = derelictBankNecromancyState("bank-search-render");
    // The engine reached the now-or-never window with combat cleared (map surface).
    expect(state.combat ?? null).toBeNull();
    expect(state.pendingChoice ?? null).toBeNull();
    expect(state.adventure?.pendingNecromancy?.playerId).toBe("p1");

    render(
      <PromptTray legalActions={getLegalActions(state, "p1")} onAction={vi.fn()} state={state} viewerPlayerId="p1" />
    );
    expect(
      screen.getByRole("button", {
        name: /resolve bonuses and continue/i,
      }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /play necromancy/i })).toBeTruthy();
  });
});

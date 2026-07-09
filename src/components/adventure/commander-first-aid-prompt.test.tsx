// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PromptTray } from "./screen";
import { applyAction, createAdventureGameState, getLegalActions, getMainHero } from "@/engine";
import { startNeutralEncounter } from "@/engine/adventure-reducer";
import { NEUTRAL_PLAYER_ID } from "@/engine/state";
import type { GameAction, GameState } from "@/engine";

afterEach(cleanup);

const WOG_ON = { enabled: true, commanders: true, newObjects: false, newCreatures: false };

function apply(state: GameState, action: GameAction): GameState {
  const r = applyAction(state, action);
  expect(r.errors.map((e) => e.message)).toEqual([]);
  return r.state;
}

/**
 * Real post-combat state: a Rampart hero (Hierophant commander) fights a neutral
 * guard, wins, and takes one bronze/silver casualty. Winning opens the
 * Hierophant's "First Aid Master" window (restore one fallen unit, or decline).
 * The hero is level 7 vs a difficulty-7 guard so the win adds no level (no
 * Ability search, no commander points) — the First Aid window is the ONLY thing
 * pending, exactly the state where the map froze.
 */
function firstAidWindowState(seed: string): GameState {
  const state = createAdventureGameState({
    seed,
    ruleset: "binh",
    difficulty: "easy",
    wog: WOG_ON,
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "One", factionId: "rampart" as never, heroDefId: "gelu" },
      { id: "p2", name: "Two", factionId: "necropolis" as never }
    ]
  });
  for (const p of Object.values(state.players)) {
    p.canMulligan = false;
    p.needsHandRefresh = false;
  }
  expect(state.players.p1.commander?.slug).toBe("hierophant");

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

  // Force the fought-win end state: one own bronze/silver unit dies, every guard
  // dies. This is the same board state the engine reaches on a casualty-win.
  let killedOwn = false;
  for (const unit of Object.values(s.combat!.units)) {
    if (unit.controllerId === NEUTRAL_PLAYER_ID) {
      unit.damage = unit.maxHealth;
    } else if (!unit.commanderSlug && !killedOwn && (unit.grade === "bronze" || unit.grade === "silver")) {
      unit.damage = unit.maxHealth;
      killedOwn = true;
    }
  }
  expect(killedOwn).toBe(true);

  s.combat!.outcome = {
    winnerPlayerId: "p1",
    defeatedPlayerId: NEUTRAL_PLAYER_ID,
    reason: "all-enemy-units-defeated"
  };
  s.combat!.endAcknowledged = false;
  s = apply(s, { type: "ACKNOWLEDGE_COMBAT_END", playerId: "p1" });
  return s;
}

describe("Hierophant commander — post-combat First Aid window renders on the map", () => {
  it("opens a real First Aid window and the engine offers only its actions", () => {
    const state = firstAidWindowState("first-aid-open");
    // The engine really opened the window and gated the turn behind it: the only
    // legal actions are the First Aid picks (no End turn / Give up yet).
    expect(state.adventure?.pendingCommanderFirstAid?.playerId).toBe("p1");
    const legal = getLegalActions(state, "p1");
    expect(legal.length).toBeGreaterThan(0);
    expect(legal.every((a) => a.action.type === "COMMANDER_FIRST_AID")).toBe(true);
    expect(legal.some((a) => a.action.type === "END_TURN")).toBe(false);
  });

  it("PromptTray renders the heal + decline buttons and dispatches the pick", () => {
    const state = firstAidWindowState("first-aid-render");
    const onAction = vi.fn();
    render(
      <PromptTray legalActions={getLegalActions(state, "p1")} onAction={onAction} state={state} viewerPlayerId="p1" />
    );

    // Without the fix the tray returns null (no surface claims the First Aid
    // window) and the player is frozen — no heal, no End turn, no Give up.
    const reviveButton = screen.getByRole("button", { name: /Revive|Restore/i });
    expect(reviveButton).toBeTruthy();
    const decline = screen.getByRole("button", { name: /decline first aid/i });
    expect(decline).toBeTruthy();

    fireEvent.click(reviveButton);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toMatchObject({ type: "COMMANDER_FIRST_AID", playerId: "p1" });
  });
});

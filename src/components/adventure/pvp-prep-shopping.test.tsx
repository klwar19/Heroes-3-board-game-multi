// @vitest-environment jsdom
/**
 * ============================================================================
 *  PvP pre-battle preparation — the town panel is live, on the MAP, for BOTH
 *  sides, before deployment.
 * ============================================================================
 *
 * When an enemy hero attacks, both the attacker and the defender get a window to
 * spend the round's town actions (build / recruit / buy spells) before the fight
 * — shown on the adventure map's town panel, not the empty battlefield. The
 * engine half is pinned in `pvp-precombat.test.ts`; this pins the UI half: the
 * TownPanel actually RENDERS interactive build/recruit controls during prep, and
 * clicking one dispatches the real action. The control: once a side accepts (and
 * is no longer `inCombatPrep`), those controls vanish.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { TownPanel, PreBattlePanel } from "./screen";
import { applyAction, createAdventureGameState, getLegalActions } from "@/engine";
import { getMainHero } from "@/engine/adventure";
import { startPlayerCombat } from "@/engine/adventure-reducer";
import type { GameState } from "@/engine/state";

afterEach(cleanup);

/** A live PvP pre-battle prep window (p1 attacks p2), both sides with fresh tokens. */
function prepState(): GameState {
  const state = createAdventureGameState({ seed: "pvp-prep-ui", difficulty: "normal", rollFirstPlayer: false });
  for (const id of ["p1", "p2"] as const) {
    state.players[id].townTokens = { build: true, population: true, spellBook: true };
    state.players[id].resources = { gold: 100, buildingMaterials: 50, valuables: 50, magic: 50 } as never;
  }
  const attacker = getMainHero(state, "p1")!;
  const defender = getMainHero(state, "p2")!;
  startPlayerCombat(state, attacker, defender, defender.spaceId ?? "0,0");
  return state;
}

describe("PvP prep — town panel shopping (UI)", () => {
  it("renders working Build buttons in the DEFENDER's town panel during prep", () => {
    const state = prepState();
    const onAction = vi.fn();
    render(<TownPanel legalActions={getLegalActions(state, "p2")} onAction={onAction} state={state} viewerPlayerId="p2" />);

    const buildButtons = screen.getAllByRole("button", { name: /^Build/ });
    expect(buildButtons.length).toBeGreaterThan(0);

    fireEvent.click(buildButtons[0]);
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "BUILD_STRUCTURE", playerId: "p2", townId: "town_p2" })
    );
  });

  it("renders working Build buttons in the ATTACKER's town panel during prep", () => {
    const state = prepState();
    const onAction = vi.fn();
    render(<TownPanel legalActions={getLegalActions(state, "p1")} onAction={onAction} state={state} viewerPlayerId="p1" />);

    const buildButtons = screen.getAllByRole("button", { name: /^Build/ });
    expect(buildButtons.length).toBeGreaterThan(0);
    fireEvent.click(buildButtons[0]);
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "BUILD_STRUCTURE", playerId: "p1", townId: "town_p1" })
    );
  });

  it("shows the recruit (Population) section during prep so units can be bought", () => {
    const state = prepState();
    render(<TownPanel legalActions={getLegalActions(state, "p2")} onAction={vi.fn()} state={state} viewerPlayerId="p2" />);
    // The recruit basket renders a "Recruit / reinforce" control set during prep.
    expect(screen.getAllByText(/recruit/i).length).toBeGreaterThan(0);
  });

  it("the PreBattlePanel points the player at the town panel and offers Accept", () => {
    const state = prepState();
    render(
      <PreBattlePanel legalActions={getLegalActions(state, "p2")} onAction={vi.fn()} state={state} viewerPlayerId="p2" />
    );
    expect(screen.getByText(/spend any town actions/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Accept the battle/i })).toBeTruthy();
  });

  it("the PreBattlePanel ITSELF surfaces working Build buttons (in-context shopping)", () => {
    const state = prepState();
    const onAction = vi.fn();
    const { container } = render(
      <PreBattlePanel legalActions={getLegalActions(state, "p2")} onAction={onAction} state={state} viewerPlayerId="p2" />
    );
    const panel = container.querySelector(".prepTownActions");
    expect(panel, "prep panel renders an in-context buy/build section").toBeTruthy();
    const buildButtons = within(panel as HTMLElement).getAllByRole("button", { name: /^Build/ });
    expect(buildButtons.length).toBeGreaterThan(0);
    fireEvent.click(buildButtons[0]);
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "BUILD_STRUCTURE", playerId: "p2", townId: "town_p2" })
    );
  });

  it("CONTROL: a participant who already accepted sees no in-panel buy/build buttons", () => {
    let state = prepState();
    state = applyAction(state, { type: "ACCEPT_COMBAT", playerId: "p2" }).state;
    const { container } = render(
      <PreBattlePanel legalActions={getLegalActions(state, "p2")} onAction={vi.fn()} state={state} viewerPlayerId="p2" />
    );
    expect(container.querySelector(".prepTownActions")).toBeNull();
  });

  it("CONTROL: once the defender accepts, the town panel offers no more build/recruit", () => {
    let state = prepState();
    const accepted = applyAction(state, { type: "ACCEPT_COMBAT", playerId: "p2" });
    expect(accepted.errors).toEqual([]);
    state = accepted.state;

    render(<TownPanel legalActions={getLegalActions(state, "p2")} onAction={vi.fn()} state={state} viewerPlayerId="p2" />);
    expect(screen.queryAllByRole("button", { name: /^Build/ })).toHaveLength(0);
  });
});

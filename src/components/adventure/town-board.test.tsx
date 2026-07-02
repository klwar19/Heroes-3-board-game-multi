// @vitest-environment jsdom
/**
 * ============================================================================
 *  Town window & board view — the physical board as the default town UI
 * ============================================================================
 *
 * Pins the redesign's contracts:
 *  - the TownWindow defaults to the BOARD view and can flip to the classic
 *    PC-art Buildings view (TownPanel) — both wired to the same actions;
 *  - built buildings fill their bar (fully-built scan crop), and a half-built
 *    SHARED bar shows the blur/outline note naming the missing sibling;
 *  - the resource-gain markers track player.production along the printed
 *    cells and move when production rises;
 *  - the build / population / spell-book token wells open their panels
 *    (construction list with working Build buttons, the recruit basket, the
 *    Mage Guild spell panel) and flip red once spent;
 *  - the board stays fully usable inside a PvP pre-battle prep window, and
 *    the PreBattlePanel can open the town window.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { TownBoardView, TownWindow } from "./town-board";
import { AdventureHud, PreBattlePanel } from "./screen";
import { CardZoomProvider } from "@/components/table/zoom";
import { createAdventureGameState, getLegalActions } from "@/engine";
import { getMainHero } from "@/engine/adventure";
import { startPlayerCombat } from "@/engine/adventure-reducer";
import type { GameState } from "@/engine/state";

afterEach(cleanup);

/** A fresh adventure: p1 = Castle (scan board; shared bar = Towers + Blacksmith). */
function freshState(): GameState {
  const state = createAdventureGameState({ seed: "town-board-ui", difficulty: "normal", rollFirstPlayer: false });
  state.players.p1.resources = { ...state.players.p1.resources, gold: 100, buildingMaterials: 50, valuables: 50 };
  return state;
}

const viewFor = (state: GameState) => (
  <TownBoardView legalActions={getLegalActions(state, "p1")} onAction={vi.fn()} state={state} viewerPlayerId="p1" />
);

describe("TownBoardView — bars", () => {
  it("renders the scan board with no filled bars for a fresh town", () => {
    const { container } = render(viewFor(freshState()));
    expect(container.querySelector(".tbBoard.scan")).toBeTruthy();
    expect(container.querySelectorAll(".tbFill")).toHaveLength(0);
    // All 7 bars are clickable regions.
    expect(container.querySelectorAll(".tbBarHit")).toHaveLength(7);
  });

  it("fills a bar with the fully-built crop once its building is built", () => {
    const state = freshState();
    state.towns.town_p1.buildings.push("castle.city_hall");
    const { container } = render(viewFor(state));
    expect(container.querySelectorAll(".tbFill")).toHaveLength(1);
    expect(container.querySelector(".tbFill.partial")).toBeNull();
    expect(container.querySelector(".tbPartialNote")).toBeNull();
  });

  it("a half-built SHARED bar blurs the crop and names the missing sibling", () => {
    const state = freshState();
    // Castle bar 3 holds Towers (dwelling_bronze) + Blacksmith.
    state.towns.town_p1.buildings.push("castle.dwelling_bronze");
    const { container } = render(viewFor(state));
    expect(container.querySelector(".tbFill.partial")).toBeTruthy();
    const note = container.querySelector(".tbPartialNote");
    expect(note?.textContent).toMatch(/Blacksmith/);
    expect(note?.textContent).toMatch(/not built/i);
  });

  it("CONTROL: the shared bar sheds the blur and note once BOTH halves are built", () => {
    const state = freshState();
    state.towns.town_p1.buildings.push("castle.dwelling_bronze", "castle.blacksmith");
    const { container } = render(viewFor(state));
    expect(container.querySelector(".tbFill.partial")).toBeNull();
    expect(container.querySelector(".tbPartialNote")).toBeNull();
  });

  it("clicking a bar opens its panel with the building's definition (and Build offer)", () => {
    const state = freshState();
    const { container } = render(viewFor(state));
    const bar = container.querySelectorAll(".tbBarHit")[1]; // Castle bar 2 = City Hall
    fireEvent.click(bar);
    const panel = container.querySelector(".tbPanel");
    expect(panel).toBeTruthy();
    expect(within(panel as HTMLElement).getByRole("button", { name: "Build" })).toBeTruthy();
    expect((panel as HTMLElement).textContent).toMatch(/City Hall/);
  });
});

describe("TownBoardView — resource-gain markers", () => {
  it("places one marker per track at the production value and moves with it", () => {
    const state = freshState();
    const { container, rerender } = render(viewFor(state));
    const goldMarker = container.querySelector(".tbMarker.gold") as HTMLElement;
    expect(goldMarker.textContent).toBe("10");
    const before = goldMarker.style.left;

    state.players.p1.production = { gold: 15, buildingMaterials: 2, valuables: 1 };
    rerender(viewFor(state));
    const movedMarker = container.querySelector(".tbMarker.gold") as HTMLElement;
    expect(movedMarker.textContent).toBe("15");
    expect(movedMarker.style.left).not.toBe(before);
    expect((container.querySelector(".tbMarker.buildingMaterials") as HTMLElement).textContent).toBe("2");
    expect((container.querySelector(".tbMarker.valuables") as HTMLElement).textContent).toBe("1");
  });
});

describe("TownBoardView — token wells", () => {
  it("construction well lists every faction building and dispatches BUILD_STRUCTURE", () => {
    const state = freshState();
    const onAction = vi.fn();
    const { container } = render(
      <TownBoardView legalActions={getLegalActions(state, "p1")} onAction={onAction} state={state} viewerPlayerId="p1" />
    );
    const buildToken = container.querySelector(".tbToken.build") as HTMLElement;
    expect(buildToken.classList.contains("ready")).toBe(true);
    fireEvent.click(buildToken);
    const panel = container.querySelector(".tbPanel") as HTMLElement;
    expect(panel.textContent).toMatch(/build a structure/i);
    // All 8 buildings listed.
    expect(panel.querySelectorAll(".tbBuildRow")).toHaveLength(8);
    const buildButtons = within(panel).getAllByRole("button", { name: "Build" });
    expect(buildButtons.length).toBeGreaterThan(0);
    fireEvent.click(buildButtons[0]);
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: "BUILD_STRUCTURE", playerId: "p1" }));
  });

  it("population well opens the recruit basket; spell well explains the missing Mage Guild", () => {
    const state = freshState();
    const { container } = render(viewFor(state));
    fireEvent.click(container.querySelector(".tbToken.population") as HTMLElement);
    expect((container.querySelector(".tbPanel") as HTMLElement).textContent).toMatch(/recruit & reinforce/i);

    fireEvent.click(container.querySelector(".tbToken.spellBook") as HTMLElement);
    expect((container.querySelector(".tbPanel") as HTMLElement).textContent).toMatch(/build the Mage Guild/i);
  });

  it("spell well offers the Mage Guild spell purchase once built", () => {
    const state = freshState();
    state.towns.town_p1.buildings.push("castle.mage_guild");
    // The engine gates the Spell Book action on the guild being built.
    const legalActions = getLegalActions(state, "p1");
    expect(legalActions.some((legal) => legal.action.type === "SPELL_BOOK_ACTION")).toBe(true);
    const onAction = vi.fn();
    const { container } = render(
      <TownBoardView legalActions={legalActions} onAction={onAction} state={state} viewerPlayerId="p1" />
    );
    fireEvent.click(container.querySelector(".tbToken.spellBook") as HTMLElement);
    const panel = container.querySelector(".tbPanel") as HTMLElement;
    const spellButton = within(panel)
      .getAllByRole("button")
      .find((button) => /spell/i.test(button.textContent ?? ""));
    expect(spellButton).toBeTruthy();
    fireEvent.click(spellButton!);
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: "SPELL_BOOK_ACTION", playerId: "p1" }));
  });

  it("marks a spent token red (and its panel explains it refreshes next round)", () => {
    const state = freshState();
    state.players.p1.townTokens = { build: false, population: true, spellBook: true };
    const { container } = render(viewFor(state));
    const buildToken = container.querySelector(".tbToken.build") as HTMLElement;
    expect(buildToken.classList.contains("spent")).toBe(true);
    expect(buildToken.querySelector(".tbTokenSpent")).toBeTruthy();
    fireEvent.click(buildToken);
    const panel = container.querySelector(".tbPanel") as HTMLElement;
    expect(within(panel).queryAllByRole("button", { name: "Build" })).toHaveLength(0);
    expect(panel.textContent).toMatch(/build token spent/i);
  });
});

describe("TownWindow — view toggle", () => {
  it("defaults to the BOARD view and flips to the classic Buildings view", () => {
    window.localStorage.removeItem("h3bg-town-view");
    const state = freshState();
    const { container } = render(
      <TownWindow
        legalActions={getLegalActions(state, "p1")}
        onAction={vi.fn()}
        onClose={vi.fn()}
        open
        state={state}
        viewerPlayerId="p1"
      />
    );
    expect(container.querySelector(".tbBoard")).toBeTruthy();
    expect(container.querySelector(".townPanel")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Buildings" }));
    expect(container.querySelector(".townPanel")).toBeTruthy();
    expect(container.querySelector(".tbBoard")).toBeNull();

    // The choice persists for the next open.
    expect(window.localStorage.getItem("h3bg-town-view")).toBe("buildings");
    window.localStorage.removeItem("h3bg-town-view");
  });

  it("renders nothing while closed and closes via the ✕ button", () => {
    const state = freshState();
    const onClose = vi.fn();
    const { container, rerender } = render(
      <TownWindow
        legalActions={getLegalActions(state, "p1")}
        onAction={vi.fn()}
        onClose={onClose}
        open={false}
        state={state}
        viewerPlayerId="p1"
      />
    );
    expect(container.querySelector(".townWindow")).toBeNull();
    rerender(
      <TownWindow
        legalActions={getLegalActions(state, "p1")}
        onAction={vi.fn()}
        onClose={onClose}
        open
        state={state}
        viewerPlayerId="p1"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /close the town window/i }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("PvP prep — the board view stays live and the prep panel opens the town", () => {
  function prepState(): GameState {
    const state = freshState();
    for (const id of ["p1", "p2"] as const) {
      state.players[id].townTokens = { build: true, population: true, spellBook: true };
      state.players[id].resources = { ...state.players[id].resources, gold: 100, buildingMaterials: 50, valuables: 50 };
    }
    const attacker = getMainHero(state, "p1")!;
    const defender = getMainHero(state, "p2")!;
    startPlayerCombat(state, attacker, defender, defender.spaceId ?? "0,0");
    return state;
  }

  it("the defender's board still offers working Build buttons during prep", () => {
    const state = prepState();
    const onAction = vi.fn();
    const { container } = render(
      <TownBoardView legalActions={getLegalActions(state, "p2")} onAction={onAction} state={state} viewerPlayerId="p2" />
    );
    fireEvent.click(container.querySelector(".tbToken.build") as HTMLElement);
    const buildButtons = within(container.querySelector(".tbPanel") as HTMLElement).getAllByRole("button", {
      name: "Build"
    });
    expect(buildButtons.length).toBeGreaterThan(0);
    fireEvent.click(buildButtons[0]);
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "BUILD_STRUCTURE", playerId: "p2", townId: "town_p2" })
    );
  });

  it("the recruit basket renders inside the population panel during prep", () => {
    const state = prepState();
    const { container } = render(
      <TownBoardView legalActions={getLegalActions(state, "p2")} onAction={vi.fn()} state={state} viewerPlayerId="p2" />
    );
    fireEvent.click(container.querySelector(".tbToken.population") as HTMLElement);
    expect((container.querySelector(".tbPanel") as HTMLElement).textContent).toMatch(/Population token — recruit/i);
  });

  it("the PreBattlePanel offers an Open town button wired to the window opener", () => {
    const state = prepState();
    const onOpenTown = vi.fn();
    render(
      <PreBattlePanel
        legalActions={getLegalActions(state, "p2")}
        onAction={vi.fn()}
        onOpenTown={onOpenTown}
        state={state}
        viewerPlayerId="p2"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /open town/i }));
    expect(onOpenTown).toHaveBeenCalled();
  });
});

describe("AdventureHud redesign", () => {
  it("drops the first-player-roll notice, keeps move/morale as chips, adds Town + hero dock", () => {
    const state = freshState();
    // Even with a recorded roll the HUD no longer announces the winner.
    state.adventure!.firstPlayerRoll = {
      attempts: [{ rolls: [{ playerId: "p1", name: "P1", value: 3 }] }],
      winnerPlayerId: "p1"
    } as never;
    const onOpenTown = vi.fn();
    const { container } = render(
      <CardZoomProvider>
        <AdventureHud
          heroSeatIds={["p1"]}
          legalActions={getLegalActions(state, "p1")}
          onAction={vi.fn()}
          onOpenTown={onOpenTown}
          state={state}
          viewerPlayerId="p1"
        />
      </CardZoomProvider>
    );
    expect(screen.queryByText(/won the first-player roll/i)).toBeNull();
    // Move + morale chips.
    const cell = container.querySelector(".moveMoraleCell") as HTMLElement;
    expect(cell.textContent).toMatch(/move/i);
    expect(cell.textContent).toMatch(/morale/i);
    // Town button opens the window.
    fireEvent.click(screen.getByRole("button", { name: /town/i }));
    expect(onOpenTown).toHaveBeenCalled();
  });

  it("the hero chip in the top bar drops the full hero board open", () => {
    const state = freshState();
    const { container } = render(
      <CardZoomProvider>
        <AdventureHud
          heroSeatIds={["p1"]}
          legalActions={getLegalActions(state, "p1")}
          onAction={vi.fn()}
          state={state}
          viewerPlayerId="p1"
        />
      </CardZoomProvider>
    );
    expect(container.querySelector(".heroDrop")).toBeNull();
    fireEvent.click(container.querySelector(".heroChip") as HTMLElement);
    const drop = container.querySelector(".heroDrop") as HTMLElement;
    expect(drop).toBeTruthy();
    // The full printed hero board (level track) is inside.
    expect(drop.querySelector(".hb")).toBeTruthy();
  });
});

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
import { AdventureHud, PreBattlePanel, TownHeroDock } from "./screen";
import { CardZoomProvider } from "@/components/table/zoom";
import { createAdventureGameState, getLegalActions } from "@/engine";
import { coreBuildingDefinitions } from "@/data/factions/core";
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

/** A stronghold town: an empty scan with the real printed board-game tile art
 *  overlaid on built bars, and the shared bar drawn as a single printed
 *  double-sided tile (one-built / both-built face), not two half-slots. */
function strongholdState(): GameState {
  const state = createAdventureGameState({
    seed: "town-board-stronghold",
    difficulty: "normal",
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "Crag Hack", factionId: "stronghold", heroDefId: "crag_hack" },
      { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
    ]
  });
  state.players.p1.resources = { gold: 200, buildingMaterials: 100, valuables: 100 };
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

  it("a half-built SHARED bar blurs the crop and names BOTH the built and missing siblings", () => {
    const state = freshState();
    // Castle bar 3 holds Towers (dwelling_bronze) + Blacksmith.
    state.towns.town_p1.buildings.push("castle.dwelling_bronze");
    const { container } = render(viewFor(state));
    expect(container.querySelector(".tbFill.partial")).toBeTruthy();
    // The BUILT sibling is named with a positive "built" marker — so a scan bar
    // whose crop shows both buildings is not mistaken for fully built.
    const built = container.querySelector(".tbPartialBuilt");
    expect(built?.textContent).toMatch(/built/i);
    expect(built?.textContent).toContain(coreBuildingDefinitions["castle.dwelling_bronze"].name);
    // ...and the not-built sibling stays clearly named.
    const missing = container.querySelector(".tbPartialMissing");
    expect(missing?.textContent).toMatch(/Blacksmith/);
    expect(missing?.textContent).toMatch(/not built/i);
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

describe("TownBoardView — cove & conflux English printed scan boards", () => {
  function scanState(factionId: "cove" | "conflux", heroDefId: string): GameState {
    const state = createAdventureGameState({
      seed: `town-board-${factionId}`,
      difficulty: "normal",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "P1", factionId, heroDefId },
        { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
    state.players.p1.resources = { gold: 200, buildingMaterials: 100, valuables: 100 };
    return state;
  }
  const townIdOf = (state: GameState) =>
    Object.entries(state.towns).find(([, t]) => t.controllerId === "p1")![0];

  it("renders both as SCAN boards (the printed English board, not a designed CSS board)", () => {
    for (const [factionId, hero] of [["cove", "astra"], ["conflux", "erdamon"]] as const) {
      cleanup();
      const { container } = render(viewFor(scanState(factionId, hero)));
      expect(container.querySelector(".tbBoard.scan"), `${factionId} scan board`).toBeTruthy();
      expect(container.querySelector(".tbBoard.designed"), `${factionId} not designed`).toBeNull();
      const base = container.querySelector("img.tbBoardBase") as HTMLImageElement;
      expect(base.src).toContain(`towns-${factionId}-board-empty.webp`);
      // Empty town: no filled bars.
      expect(container.querySelectorAll(".tbFill")).toHaveLength(0);
    }
  });

  it("reveals a built building's OWN printed slot from the full scan (correct slot mapping)", () => {
    // Cove's Redoubled Vortex (dwelling_gold) sits at printed slot 4. Building it
    // fills exactly bar index 4 with a crop of the cove full scan — proving the
    // bars follow the printed layout, so the crop shows the right building.
    const state = scanState("cove", "astra");
    state.towns[townIdOf(state)].buildings.push("cove.dwelling_gold");
    const { container } = render(viewFor(state));
    const bars = Array.from(container.querySelectorAll(".tbBar"));
    const filledIndexes = bars.flatMap((bar, i) => (bar.querySelector(".tbFill") ? [i] : []));
    expect(filledIndexes, "only Redoubled Vortex's slot fills").toEqual([4]);
    const crop = bars[4].querySelector(".tbFill img") as HTMLImageElement;
    expect(crop.src).toContain("towns-cove-board-full.webp");
    // The crop is offset to slot 4 (left = -(window.left + 4*barPitch)/barPitch).
    expect(crop.style.left).toContain("-");
  });

  it("draws the shared Bay + Pub bar as one crop and names both halves while half-built", () => {
    const state = scanState("cove", "astra");
    state.towns[townIdOf(state)].buildings.push("cove.dwelling_bronze"); // Bay up, Pub not
    const { container } = render(viewFor(state));
    expect(container.querySelector(".tbFill.partial")).toBeTruthy();
    const note = container.querySelector(".tbPartialNote");
    expect(note?.textContent).toMatch(new RegExp(coreBuildingDefinitions["cove.dwelling_bronze"].name, "i"));
    expect(note?.textContent).toMatch(/Pub/);
    expect(note?.textContent).toMatch(/not built/i);
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
  it("drops the first-player-roll notice and keeps move/morale as chips", () => {
    const state = freshState();
    // Even with a recorded roll the HUD no longer announces the winner.
    state.adventure!.firstPlayerRoll = {
      attempts: [{ rolls: [{ playerId: "p1", name: "P1", value: 3 }] }],
      winnerPlayerId: "p1"
    } as never;
    const { container } = render(
      <CardZoomProvider>
        <AdventureHud
          legalActions={getLegalActions(state, "p1")}
          onAction={vi.fn()}
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
    // The town + hero live in the dock above the map now, not the status bar.
    expect(container.querySelector(".townDockTile")).toBeNull();
  });
});

describe("TownHeroDock (above the map)", () => {
  it("shows a big Town tile that opens the town window", () => {
    const state = freshState();
    const onOpenTown = vi.fn();
    render(
      <CardZoomProvider>
        <TownHeroDock heroSeatIds={["p1"]} onOpenTown={onOpenTown} state={state} viewerPlayerId="p1" />
      </CardZoomProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: /open your .*town/i }));
    expect(onOpenTown).toHaveBeenCalled();
  });

  it("shows a big Hero tile that drops the full hero board open, closeable again", () => {
    const state = freshState();
    const { container } = render(
      <CardZoomProvider>
        <TownHeroDock heroSeatIds={["p1"]} onOpenTown={vi.fn()} state={state} viewerPlayerId="p1" />
      </CardZoomProvider>
    );
    expect(container.querySelector(".heroDrop")).toBeNull();
    fireEvent.click(container.querySelector(".heroDockTile") as HTMLElement);
    const drop = container.querySelector(".heroDrop") as HTMLElement;
    expect(drop).toBeTruthy();
    // The full printed hero board (level track) is inside.
    expect(drop.querySelector(".hb")).toBeTruthy();
    // Clicking the tile again (or its close button) dismisses it.
    fireEvent.click(container.querySelector(".heroDropClose") as HTMLElement);
    expect(container.querySelector(".heroDrop")).toBeNull();
  });
});

describe("Designed board — tile art, shared-bar clarity, modal panels", () => {
  it("a built building shows its downloaded tile art (stronghold)", () => {
    const state = strongholdState();
    state.towns.town_p1.buildings.push("stronghold.city_hall");
    const { container } = render(viewFor(state));
    const art = container.querySelector(".tbTileArt") as HTMLImageElement | null;
    expect(art).toBeTruthy();
    expect(art!.getAttribute("src")).toMatch(/stronghold-city_hall\.webp/);
  });

  it("the SHARED bar (one built) shows the printed ONE-BUILT face — crisp, not split, not blurred — and names built vs not-built", () => {
    const state = strongholdState();
    // The shared bar is Barracks Tower (dwelling_bronze) + Freelancer's Guild:
    // a single printed double-sided tile, not two half-slots.
    state.towns.town_p1.buildings.push("stronghold.dwelling_bronze");
    const { container } = render(viewFor(state));
    // The whole bar is the printed ONE-BUILT face…
    const combined = container.querySelector(".tbFill.combined .tbCombinedImg") as HTMLImageElement | null;
    expect(combined).toBeTruthy();
    expect(combined!.getAttribute("src")).toMatch(/stronghold-shared-one\.webp/);
    // …NOT the old two-half split (a DesignedTile / unbuilt socket)…
    expect(container.querySelector(".tbDesignedTile")).toBeNull();
    // …and NOT blurred: the shared bar/fill never carries the `partial` blur/outline.
    expect(container.querySelector(".tbFill.combined.partial")).toBeNull();
    expect(container.querySelector(".tbBar.partial")).toBeNull();
    // The label still names which building is up (✓) and which is not (🔨).
    const note = container.querySelector(".tbFill.combined .tbPartialNote") as HTMLElement | null;
    expect(note).toBeTruthy();
    expect(note!.textContent).toMatch(/Barracks Tower built/i);
    expect(note!.textContent).toMatch(/Freelancer.*not built/i);
  });

  it("the SHARED bar (both built) flips to the printed BOTH-BUILT face with no missing-half label", () => {
    const state = strongholdState();
    state.towns.town_p1.buildings.push("stronghold.dwelling_bronze", "stronghold.freelancers_guild");
    const { container } = render(viewFor(state));
    const combined = container.querySelector(".tbFill.combined .tbCombinedImg") as HTMLImageElement | null;
    expect(combined).toBeTruthy();
    expect(combined!.getAttribute("src")).toMatch(/stronghold-shared-both\.webp/);
    // Both up → the shared tile is complete, so there is no "not built" note.
    expect(container.querySelector(".tbFill.combined .tbPartialNote")).toBeNull();
  });

  it("a token well opens a centred MODAL (not an inline strip), with resource-aware build options", () => {
    const state = strongholdState();
    const { container } = render(viewFor(state));
    // No modal until a well is clicked.
    expect(container.querySelector(".tbPanelBackdrop")).toBeNull();
    fireEvent.click(container.querySelector(".tbToken.build") as HTMLElement);
    // The panel is now inside the modal backdrop, not appended below the board.
    const modal = container.querySelector(".tbPanelBackdrop .tbPanelModal .tbPanel") as HTMLElement | null;
    expect(modal).toBeTruthy();
    // Build options spell out cost vs. what you have (a coloured cost chip).
    expect(modal!.querySelector(".tbCostChip")).toBeTruthy();
    // Backdrop click closes it.
    fireEvent.click(container.querySelector(".tbPanelBackdrop") as HTMLElement);
    expect(container.querySelector(".tbPanelBackdrop")).toBeNull();
  });

  it("building a structure dispatches BUILD_STRUCTURE and closes the modal", () => {
    const state = strongholdState();
    const onAction = vi.fn();
    const { container } = render(
      <TownBoardView legalActions={getLegalActions(state, "p1")} onAction={onAction} state={state} viewerPlayerId="p1" />
    );
    fireEvent.click(container.querySelector(".tbToken.build") as HTMLElement);
    const buildBtn = within(container.querySelector(".tbPanelBackdrop") as HTMLElement).getAllByRole("button", {
      name: /^build$/i
    })[0];
    fireEvent.click(buildBtn);
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: "BUILD_STRUCTURE" }));
    // The modal closes so the newly-lit bar on the board is what shows.
    expect(container.querySelector(".tbPanelBackdrop")).toBeNull();
  });
});

/** A factory town: a designed board WITH a built-town reveal image AND real
 *  per-building printed tiles, plus the pasted authentic tracks panel. */
function factoryState(): GameState {
  const state = createAdventureGameState({
    seed: "town-board-factory",
    difficulty: "normal",
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "Henrietta", factionId: "factory", heroDefId: "henrietta" },
      { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
    ]
  });
  state.players.p1.resources = { gold: 200, buildingMaterials: 100, valuables: 100 };
  return state;
}

describe("Designed board — authentic printed art (reveal slice + tile overlay, tracks panel)", () => {
  it("factory: a built bar shows the REAL printed building tile directly (no muddy panorama slice)", () => {
    const state = factoryState();
    if (!state.towns.town_p1.buildings.includes("factory.city_hall")) {
      state.towns.town_p1.buildings.push("factory.city_hall");
    }
    const { container } = render(viewFor(state));
    // The Factory board carries the real printed portrait tiles: a raised slot
    // shows its own built illustration full-bleed…
    expect(container.querySelector(".tbRealTile.built")).toBeTruthy();
    expect(container.querySelector(".tbRealTileImg[src*='factory-city_hall']")).toBeTruthy();
    // …and NOT the old fullImage panorama-reveal slice (which muddied the tiles).
    expect(container.querySelector(".tbPanoramaSlice")).toBeNull();
  });

  it("designed boards paste the authentic printed tracks/tokens panel instead of CSS cells", () => {
    const state = factoryState();
    const { container } = render(viewFor(state));
    // The Stronghold-scan crop is pasted…
    const panel = container.querySelector(".tbPanelArt") as HTMLImageElement | null;
    expect(panel).toBeTruthy();
    expect(panel!.getAttribute("src")).toMatch(/town-tracks-panel\.webp/);
    // …so the CSS mock cells and the overlay token icons stay unmounted…
    expect(container.querySelector(".tbTrackCell")).toBeNull();
    expect(container.querySelector(".tbTokenImg")).toBeNull();
    // …while the live production markers and working token buttons remain.
    expect(container.querySelectorAll(".tbMarker")).toHaveLength(3);
    expect(container.querySelectorAll(".tbToken")).toHaveLength(3);
  });

  it("scan boards (stronghold) keep their own printed panel: no pasted crop", () => {
    const state = strongholdState();
    const { container } = render(viewFor(state));
    expect(container.querySelector(".tbPanelArt")).toBeNull();
    expect(container.querySelector(".tbTrackCell")).toBeNull();
  });

  it("token wells over the printed panel stay transparent (no opaque 'designed' plate)", () => {
    const state = factoryState();
    const { container } = render(viewFor(state));
    expect(container.querySelectorAll(".tbToken")).toHaveLength(3);
    // The printed panel provides the wells — an opaque CSS plate would hide them.
    expect(container.querySelector(".tbToken.designed")).toBeNull();
  });

  it("a half-built shared bar shows the printed plaque tile for the missing half (no scan-style note)", () => {
    const state = factoryState();
    // Bank shares its bar with the Industrialized Catacombs (dwelling_silver).
    if (!state.towns.town_p1.buildings.includes("factory.bank")) {
      state.towns.town_p1.buildings.push("factory.bank");
    }
    const { container } = render(viewFor(state));
    // The raised half shows its built tile, the missing half its own name/cost
    // plaque tile — a distinct, self-labelling slot…
    expect(container.querySelector(".tbRealTile.built")).toBeTruthy();
    expect(container.querySelector(".tbRealTile.unbuilt")).toBeTruthy();
    // …so the scan-board written note must NOT double-label the bar.
    expect(container.querySelector(".tbPartialNote")).toBeNull();
  });

  it("each built Factory bar shows ITS OWN printed tile (the citadel↔mana-generator swap is fixed)", () => {
    const state = factoryState();
    for (const id of ["factory.citadel", "factory.mage_guild", "factory.city_hall"]) {
      if (!state.towns.town_p1.buildings.includes(id)) {
        state.towns.town_p1.buildings.push(id);
      }
    }
    const { container } = render(viewFor(state));
    // Every raised slot renders the tile keyed to its OWN building id — the
    // regression that had the Citadel slot show the Mana Generator tower (and the
    // Mana Generator slot show its cost-banner plaque) fails this.
    expect(container.querySelector(".tbRealTileImg[src*='factory-citadel']")).toBeTruthy();
    expect(container.querySelector(".tbRealTileImg[src*='factory-mage_guild']")).toBeTruthy();
    expect(container.querySelector(".tbRealTileImg[src*='factory-city_hall']")).toBeTruthy();
    // The built Mana Generator uses the clean built art, NOT the "-unbuilt" plaque
    // (with the printed resource cost) the player flagged.
    expect(container.querySelector(".tbRealTileImg[src*='factory-mage_guild-unbuilt']")).toBeNull();
  });
});

describe("Authentic token icons (dock + town window header)", () => {
  it("the dock shows the printed token icons and dims a spent one", () => {
    const state = freshState();
    state.players.p1.townTokens.build = false;
    const { container } = render(
      <CardZoomProvider>
        <TownHeroDock heroSeatIds={["p1"]} onOpenTown={vi.fn()} state={state} viewerPlayerId="p1" />
      </CardZoomProvider>
    );
    const build = container.querySelector(".dockTokens img[src*='token-build']") as HTMLImageElement | null;
    const population = container.querySelector(".dockTokens img[src*='token-population']") as HTMLImageElement | null;
    expect(build).toBeTruthy();
    expect(population).toBeTruthy();
    expect(build!.className).toBe("off");
    expect(population!.className).toBe("on");
  });

  it("the town window header shows the printed token icons (no emoji)", () => {
    const state = freshState();
    state.players.p1.townTokens.spellBook = false;
    const { container } = render(
      <CardZoomProvider>
        <TownWindow
          legalActions={getLegalActions(state, "p1")}
          onAction={vi.fn()}
          onClose={vi.fn()}
          open
          state={state}
          viewerPlayerId="p1"
        />
      </CardZoomProvider>
    );
    const tokens = container.querySelector(".townWindowTokens") as HTMLElement;
    expect(tokens.querySelector("img[src*='token-build']")).toBeTruthy();
    expect((tokens.querySelector("img[src*='token-spellbook']") as HTMLImageElement).className).toBe("off");
    expect(tokens.textContent).not.toMatch(/🔨|👥|📖/u);
  });
});

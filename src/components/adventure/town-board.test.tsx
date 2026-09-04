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
import { AdventureHud, PreBattlePanel, TownHeroDock, TownPanel } from "./screen";
import { CardZoomProvider } from "@/components/table/zoom";
import { createAdventureGameState, getLegalActions } from "@/engine";
import { coreBuildingDefinitions } from "@/data/factions/core";
import { getMainHero } from "@/engine/adventure";
import { startPlayerCombat } from "@/engine/adventure-reducer";
import type { GameState } from "@/engine/state";

afterEach(cleanup);

/** A fresh adventure: p1 = Castle (scan board; shared bar = Towers + Blacksmith). */
function freshState(): GameState {
  const state = createAdventureGameState({ startingBuildings: [], seed: "town-board-ui", difficulty: "normal", rollFirstPlayer: false });
  state.players.p1.resources = { ...state.players.p1.resources, gold: 100, buildingMaterials: 50, valuables: 50 };
  return state;
}

/** A stronghold town: an empty scan with the real printed board-game tile art
 *  overlaid on built bars, and the shared bar drawn as a single printed
 *  double-sided tile (one-built / both-built face), not two half-slots. */
function strongholdState(): GameState {
  const state = createAdventureGameState({ startingBuildings: [],
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

/**
 * The reported bug's exact state (2026-08): the Astrologers' "Mages" card face
 * up on its even round — "using the Spell Book token is free. You can use it
 * even if you do not have a Mage Guild built" — with a town that has NO Mage
 * Guild. The engine offers the free purchase here; the town window used to hide
 * it (both views only hosted the Spell Book buttons on a BUILT Mage Guild),
 * while the same offer was clickable from the PvP prep panel.
 */
function magesState(): GameState {
  const state = freshState();
  state.round = 2;
  state.adventure!.astrologers = {
    activeCardId: "astrologers.mages",
    nextResourceModifiers: { gold: 0, valuables: 0 },
    crazyWizardUsedBy: [],
    swiftWeaselUsedBy: []
  };
  state.players.p1.resources = { ...state.players.p1.resources, gold: 0 }; // prove it is free
  return state;
}

function modTownState(factionId: "fuyuki" | "azure_breeze", heroDefId: "bin" | "qingyun"): GameState {
  return createAdventureGameState({ startingBuildings: [],
    seed: `town-board-${factionId}-strips`,
    difficulty: "normal",
    rollFirstPlayer: false,
    anime: {
      enabled: true,
      isekaiTowns: factionId === "fuyuki",
      xianxiaTowns: factionId === "azure_breeze"
    },
    players: [
      { id: "p1", name: "P1", factionId, heroDefId },
      { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
    ]
  });
}

function littleBustersTownState(): GameState {
  return createAdventureGameState({
    startingBuildings: [],
    seed: "town-board-little-busters-progressive-build",
    difficulty: "normal",
    rollFirstPlayer: false,
    anime: { enabled: true, isekaiTowns: true },
    players: [
      { id: "p1", name: "Riki", factionId: "little_busters", heroDefId: "riki_naoe" },
      { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
    ]
  });
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

  it("marks every not-built bar with a blurred 'not built' overlay (fresh town)", () => {
    const { container } = render(viewFor(freshState()));
    // A fresh town has all 7 bars unbuilt → each gets the blur + label overlay
    // (distinct from `.tbFill`, which marks a BUILT bar's crop).
    expect(container.querySelectorAll(".tbScanUnbuilt")).toHaveLength(7);
    expect(container.textContent).toContain("not built");
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
  it.each([
    ["fuyuki", "bin", "fuyuki.city_hall", "fuyuki-city-empty-v2.webp", "fuyuki-bar-1.webp"],
    ["azure_breeze", "qingyun", "azure_breeze.dwelling_bronze", "azure-breeze-sect-empty-v2.webp", "azure-breeze-bar-1.webp"]
  ] as const)("%s reveals the correct contiguous strip over its matching empty panorama", (factionId, heroId, buildingId, emptyArt, stripArt) => {
    const state = modTownState(factionId, heroId);
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1")!;
    town.buildings.push(buildingId);
    const { container } = render(viewFor(state));
    expect((container.querySelector(".tbDesignedWindow img") as HTMLImageElement).src).toContain(emptyArt);
    const strip = container.querySelector(".tbBarTileArt") as HTMLImageElement;
    expect(strip).toBeTruthy();
    expect(strip.src).toContain(stripArt);
  });

  function scanState(factionId: "cove" | "conflux", heroDefId: string): GameState {
    const state = createAdventureGameState({ startingBuildings: [],
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

describe("TownBoardView — designed-board blur/not-built (anime, wuxia, future towns)", () => {
  it.each([
    ["fuyuki", "bin"],
    ["azure_breeze", "qingyun"]
  ] as const)("%s (a DESIGNED board) blurs every unbuilt bar and labels it 'not built'", (factionId, heroId) => {
    const state = modTownState(factionId, heroId);
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1")!;
    const { container } = render(viewFor(state));

    // It renders as a DESIGNED board (no empty-scan), so it USED to fall through
    // to plain plates with no blur/not-built cue — the gap this fixes.
    expect(container.querySelector(".tbBoard.designed"), `${factionId} designed board`).toBeTruthy();
    expect(container.querySelector(".tbBoard.scan"), `${factionId} is not a scan board`).toBeNull();
    // Scan-board blur (`.tbScanUnbuilt`) never applies to a designed board.
    expect(container.querySelectorAll(".tbScanUnbuilt")).toHaveLength(0);

    // Every unbuilt designed bar now carries the blurred built-slice PREVIEW and
    // the explicit "not built" plaque — the "blur + not built" cue.
    const emptyBars = container.querySelectorAll(".tbEmptyBar");
    expect(emptyBars.length, "a fresh town has ≥1 unbuilt bar").toBeGreaterThanOrEqual(1);
    emptyBars.forEach((bar) => {
      expect(bar.querySelector(".tbEmptyPreview"), "blurred built-slice preview").toBeTruthy();
      expect(bar.querySelector(".tbUnbuiltPlaque")?.textContent).toMatch(/not built/i);
    });
    // The preview is the bar's OWN built slice art (so it reads as a preview of
    // what will go up, not a generic placeholder).
    const preview = emptyBars[0].querySelector(".tbEmptyPreview") as HTMLImageElement;
    expect(preview.src).toMatch(new RegExp(`${factionId.replace("_", "-")}-bar-\\d`));

    // CONTROL: build a bar's building and it sheds the empty-bar blur for the
    // crisp built slice — proving the preview is tied to build state, not decor.
    town.buildings.push(`${factionId}.city_hall`);
    cleanup();
    const { container: after } = render(viewFor(state));
    // One fewer empty bar than before (the City Hall bar now shows built art).
    expect(after.querySelectorAll(".tbEmptyBar").length).toBeLessThan(emptyBars.length);
    expect(after.querySelector(".tbBarTileArt"), "the built bar shows its crisp slice").toBeTruthy();
  });

  it("CONTROL: a SCAN board (Castle) keeps the scan blur and grows NO designed preview", () => {
    const { container } = render(viewFor(freshState()));
    // Scan boards use `.tbScanUnbuilt` (backdrop blur of the empty scan), never
    // the designed-board `.tbEmptyBar`/`.tbEmptyPreview` path.
    expect(container.querySelectorAll(".tbScanUnbuilt").length).toBeGreaterThan(0);
    expect(container.querySelector(".tbEmptyPreview")).toBeNull();
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

  it("shows and enables the materials-only side-building cost when its rule is on", () => {
    const state = freshState();
    state.adventure!.houseRules!["side-buildings-materials-only"] = true;
    state.towns.town_p1.buildings.push("castle.dwelling_bronze");
    state.players.p1.resources = { gold: 0, buildingMaterials: 3, valuables: 0 };
    const { container } = render(viewFor(state));

    fireEvent.click(container.querySelector(".tbToken.build") as HTMLElement);
    const blacksmith = Array.from(container.querySelectorAll(".tbBuildRow")).find(
      (row) => row.textContent?.includes("Blacksmith"),
    ) as HTMLElement;
    expect(blacksmith).toBeTruthy();
    expect(blacksmith.querySelectorAll(".tbCostChip")).toHaveLength(1);
    expect(blacksmith.querySelector(".tbCostChip")?.getAttribute("title")).toMatch(
      /Building materials \(ore\): costs 3, you have 3/,
    );
    expect(within(blacksmith).getByRole("button", { name: "Build" })).toBeTruthy();
  });

  it("population well opens the recruit basket; spell well explains the missing Mage Guild", () => {
    const state = freshState();
    const legalActions = getLegalActions(state, "p1");
    // CONTROL for the Mages cases below: with no waiver the engine offers
    // nothing, so the panel must stay a build prompt with no purchase button.
    expect(legalActions.some((legal) => legal.action.type === "SPELL_BOOK_ACTION")).toBe(false);
    const { container } = render(
      <TownBoardView legalActions={legalActions} onAction={vi.fn()} state={state} viewerPlayerId="p1" />
    );
    fireEvent.click(container.querySelector(".tbToken.population") as HTMLElement);
    expect((container.querySelector(".tbPanel") as HTMLElement).textContent).toMatch(/recruit & reinforce/i);

    fireEvent.click(container.querySelector(".tbToken.spellBook") as HTMLElement);
    const panel = container.querySelector(".tbPanel") as HTMLElement;
    expect(panel.textContent).toMatch(/build the Mage Guild/i);
    expect(
      within(panel)
        .getAllByRole("button")
        .filter((button) => /buy spell/i.test(button.textContent ?? ""))
    ).toHaveLength(0);
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

  // -------------------------------------------------------------------------
  // Reported bug: "This astro card seems to do nothing: Mages … going into town
  // it seemed like I had to build the mage guild." The engine offered the free
  // purchase; the town window had no host for it without a built Mage Guild.
  // -------------------------------------------------------------------------

  it("spell well offers the FREE Mages purchase with NO Mage Guild built (reported bug)", () => {
    const state = magesState();
    expect(state.towns.town_p1.buildings).not.toContain("castle.mage_guild");
    const legalActions = getLegalActions(state, "p1");
    // The engine's side of the card (pinned in astrologers-combat-cards.test.ts).
    expect(
      legalActions.find((legal) => legal.action.type === "SPELL_BOOK_ACTION")?.label
    ).toMatch(/^0 gold: Buy spell/);

    const onAction = vi.fn();
    const { container } = render(
      <TownBoardView legalActions={legalActions} onAction={onAction} state={state} viewerPlayerId="p1" />
    );
    // The well itself must stop telling the player to build the guild.
    const well = container.querySelector(".tbToken.spellBook") as HTMLElement;
    expect(well.getAttribute("title")).toMatch(/with no Mage Guild built/i);
    expect(well.getAttribute("title")).not.toMatch(/build the Mage Guild/i);

    fireEvent.click(well);
    const panel = container.querySelector(".tbPanel") as HTMLElement;
    // ...and the panel hosts the live purchase, honestly marked "not built".
    expect(panel.querySelector(".buildingDetailUnbuilt")?.textContent).toMatch(/not built/i);
    const buy = within(panel)
      .getAllByRole("button")
      .find((button) => /0 gold: Buy spell/i.test(button.textContent ?? ""));
    expect(buy).toBeTruthy();
    fireEvent.click(buy!);
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: "SPELL_BOOK_ACTION", playerId: "p1" }));
  });

  it("the Mage Guild's own BAR panel offers the free Mages purchase too", () => {
    const state = magesState();
    const onAction = vi.fn();
    const { container } = render(
      <TownBoardView legalActions={getLegalActions(state, "p1")} onAction={onAction} state={state} viewerPlayerId="p1" />
    );
    // Castle bar 7 (index 6) = the Mage Guild.
    fireEvent.click(container.querySelectorAll(".tbBarHit")[6]);
    const panel = container.querySelector(".tbPanel") as HTMLElement;
    const buy = within(panel)
      .getAllByRole("button")
      .find((button) => /0 gold: Buy spell/i.test(button.textContent ?? ""));
    expect(buy).toBeTruthy();
    fireEvent.click(buy!);
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: "SPELL_BOOK_ACTION", playerId: "p1" }));
    // The build row stays on show — the guild is still worth building later
    // (this fixture holds 0 gold, so it reads "not enough resources").
    expect(panel.querySelectorAll(".tbBuildRow").length).toBe(1);
  });

  it("CONTROL: on the following (odd) round the waiver is gone and so is the town offer", () => {
    const state = magesState();
    state.round = 3; // Mages still face up, but "during this round" has passed
    const legalActions = getLegalActions(state, "p1");
    expect(legalActions.some((legal) => legal.action.type === "SPELL_BOOK_ACTION")).toBe(false);
    const { container } = render(
      <TownBoardView legalActions={legalActions} onAction={vi.fn()} state={state} viewerPlayerId="p1" />
    );
    fireEvent.click(container.querySelector(".tbToken.spellBook") as HTMLElement);
    const panel = container.querySelector(".tbPanel") as HTMLElement;
    expect(panel.textContent).toMatch(/build the Mage Guild/i);
    expect(
      within(panel)
        .getAllByRole("button")
        .filter((button) => /buy spell/i.test(button.textContent ?? ""))
    ).toHaveLength(0);
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

  it("shows the player's current resources (and income) in the town header", () => {
    const state = freshState();
    state.players.p1.resources = { gold: 42, buildingMaterials: 7, valuables: 3 };
    state.players.p1.production = { gold: 10, buildingMaterials: 2, valuables: 1 };
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
    const strip = container.querySelector(".townWindowResources");
    expect(strip).toBeTruthy();
    expect(strip?.textContent).toMatch(/42/);
    expect(strip?.textContent).toMatch(/7/);
    expect(strip?.textContent).toMatch(/3/);
    // Income tags so build costs can be weighed against upcoming income.
    expect(strip?.textContent).toMatch(/\+10/);
    expect(strip?.getAttribute("aria-label")).toMatch(/resources/i);
  });

  it("the classic Buildings view opens the UNBUILT Mage Guild's use panel under Mages", () => {
    // The second town surface of the reported bug: the classic PC-art list only
    // ever showed an "Effect / Use" button on a BUILT building, and its open
    // panel additionally required the building to be in town.buildings.
    const state = magesState();
    const onAction = vi.fn();
    const { container } = render(
      <TownPanel legalActions={getLegalActions(state, "p1")} onAction={onAction} state={state} viewerPlayerId="p1" />
    );
    const guildRow = [...container.querySelectorAll(".townBuilding")].find((row) =>
      /Mage Guild/.test(row.textContent ?? "")
    ) as HTMLElement;
    expect(guildRow).toBeTruthy();
    expect(guildRow.classList.contains("built")).toBe(false);
    // The "Use ▾" affordance is there because the engine has an offer for it.
    const use = within(guildRow)
      .getAllByRole("button")
      .find((button) => /Use/.test(button.textContent ?? ""));
    expect(use).toBeTruthy();
    fireEvent.click(use!);
    const panel = container.querySelector(".townBuildingDetail") as HTMLElement;
    expect(panel.querySelector(".buildingDetailUnbuilt")?.textContent).toMatch(/not built/i);
    const buy = within(panel)
      .getAllByRole("button")
      .find((button) => /0 gold: Buy spell/i.test(button.textContent ?? ""));
    expect(buy).toBeTruthy();
    fireEvent.click(buy!);
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: "SPELL_BOOK_ACTION", playerId: "p1" }));
  });

  it("CONTROL: without Mages the unbuilt Mage Guild offers only Build in the Buildings view", () => {
    const state = freshState();
    const { container } = render(
      <TownPanel legalActions={getLegalActions(state, "p1")} onAction={vi.fn()} state={state} viewerPlayerId="p1" />
    );
    const guildRow = [...container.querySelectorAll(".townBuilding")].find((row) =>
      /Mage Guild/.test(row.textContent ?? "")
    ) as HTMLElement;
    const buttons = within(guildRow)
      .getAllByRole("button")
      .map((button) => button.textContent ?? "");
    expect(buttons.some((label) => /Build/.test(label))).toBe(true);
    expect(buttons.some((label) => /Use|Effect/.test(label))).toBe(false);
  });

  it("surfaces rules errors INSIDE the window (the page banner is hidden behind the modal)", () => {
    // Report 2: a build refused while the town window is open produced "only
    // sound" because the shared error banner sits in normal document flow behind
    // the fixed, z-indexed town modal. The window renders the errors itself.
    const state = freshState();
    const { container, rerender } = render(
      <TownWindow
        errors={["You don't have enough gold."]}
        legalActions={getLegalActions(state, "p1")}
        onAction={vi.fn()}
        onClose={vi.fn()}
        open
        state={state}
        viewerPlayerId="p1"
      />
    );
    const banner = container.querySelector(".townWindowErrors");
    expect(banner).toBeTruthy();
    expect(banner?.getAttribute("role")).toBe("alert");
    expect(banner?.textContent).toMatch(/enough gold/i);

    // CONTROL: no errors → no in-window banner (so it never nags when nothing failed).
    rerender(
      <TownWindow
        errors={[]}
        legalActions={getLegalActions(state, "p1")}
        onAction={vi.fn()}
        onClose={vi.fn()}
        open
        state={state}
        viewerPlayerId="p1"
      />
    );
    expect(container.querySelector(".townWindowErrors")).toBeNull();
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

  it("shows the viewer's crowns (expert uses) as remaining / round total beside move & morale", () => {
    const state = freshState();
    const player = state.players.p1;
    player.limits.expertUses = 3;
    player.combatStats.expertUseBonusThisRound = 1;
    player.combatStats.expertUsesSpentThisRound = 1;
    const { container } = render(
      <CardZoomProvider>
        <AdventureHud legalActions={getLegalActions(state, "p1")} onAction={vi.fn()} state={state} viewerPlayerId="p1" />
      </CardZoomProvider>
    );
    // The crowns chip lives in the same cell as movement & morale.
    const crownChip = container.querySelector(".moveMoraleCell .crownChip") as HTMLElement;
    expect(crownChip).toBeTruthy();
    // remaining = 3 (level) + 1 (bonus) − 1 (spent) = 3; total = 3 + 1 = 4.
    expect(crownChip.querySelector("b")?.textContent?.replace(/\s+/g, " ").trim()).toBe("3 / 4");
    expect(crownChip.textContent).toMatch(/crowns/i);
    expect(crownChip.getAttribute("title")).toMatch(/expert uses/i);
  });

  it("CONTROL: spending one more crown drops the remaining number (total unchanged)", () => {
    const state = freshState();
    const player = state.players.p1;
    player.limits.expertUses = 3;
    player.combatStats.expertUseBonusThisRound = 1;
    player.combatStats.expertUsesSpentThisRound = 2; // one more crown spent than above
    const { container } = render(
      <CardZoomProvider>
        <AdventureHud legalActions={getLegalActions(state, "p1")} onAction={vi.fn()} state={state} viewerPlayerId="p1" />
      </CardZoomProvider>
    );
    const crownChip = container.querySelector(".moveMoraleCell .crownChip") as HTMLElement;
    // remaining = 3 + 1 − 2 = 2, denominator still 4 — the chip reads the spent count.
    expect(crownChip.querySelector("b")?.textContent?.replace(/\s+/g, " ").trim()).toBe("2 / 4");
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

describe("Stronghold scan board — seven-slice reveal and modal panels", () => {
  it("a built building reveals the matching slice of the genuine full scan", () => {
    const state = strongholdState();
    state.towns.town_p1.buildings.push("stronghold.city_hall");
    const { container } = render(viewFor(state));
    const art = container.querySelector(".tbBar[data-building-slot='1'] .tbFill img") as HTMLImageElement | null;
    expect(art).toBeTruthy();
    expect(art!.getAttribute("src")).toMatch(/towns-stronghold-full\.webp/);
  });

  it("the shared fourth slice names the built and missing halves when partially built", () => {
    const state = strongholdState();
    state.towns.town_p1.buildings.push("stronghold.dwelling_bronze");
    const { container } = render(viewFor(state));
    const shared = container.querySelector(".tbBar[data-building-slot='4'] .tbFill.partial img") as HTMLImageElement | null;
    expect(shared).toBeTruthy();
    expect(shared!.getAttribute("src")).toMatch(/towns-stronghold-full\.webp/);
    const note = container.querySelector(".tbBar[data-building-slot='4'] .tbPartialNote") as HTMLElement | null;
    expect(note).toBeTruthy();
    expect(note!.textContent).toMatch(/Barracks Tower built/i);
    expect(note!.textContent).toMatch(/Freelancer.*not built/i);
  });

  it("the shared fourth slice is complete when both buildings are built", () => {
    const state = strongholdState();
    state.towns.town_p1.buildings.push("stronghold.dwelling_bronze", "stronghold.freelancers_guild");
    const { container } = render(viewFor(state));
    expect(container.querySelector(".tbBar[data-building-slot='4'] .tbFill img[src*='towns-stronghold-full']")).toBeTruthy();
    expect(container.querySelector(".tbBar[data-building-slot='4'] .tbPartialNote")).toBeNull();
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
  const state = createAdventureGameState({ startingBuildings: [],
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
  it("Little Busters visibly changes from the empty campus to built-town slices", () => {
    const empty = littleBustersTownState();
    const emptyRender = render(viewFor(empty));
    const emptyCampus = emptyRender.container.querySelector("img[src*='little-busters-campus-empty']");
    expect(emptyCampus).toBeTruthy();
    expect(emptyCampus?.classList.contains("tbTownArtTopAligned")).toBe(true);
    expect(emptyRender.container.querySelector(".tbPanoramaSlice")).toBeNull();
    expect(emptyRender.container.querySelectorAll(".tbBar.unbuilt")).toHaveLength(7);
    expect(emptyRender.container.querySelector(".tbEmptyPreview")).toBeNull();
    expect(emptyRender.container.querySelector(".tbConstructionSlot")).toBeNull();
    emptyRender.unmount();

    const built = littleBustersTownState();
    built.towns.town_p1.buildings.push("little_busters.city_hall");
    const builtRender = render(viewFor(built));
    expect(builtRender.container.querySelector(".tbLittleBustersPhysicalTile")).toBeTruthy();
    expect(
      builtRender.container.querySelector(".tbLittleBustersPhysicalTile .tbBarTileArt")?.classList.contains("tbTownArtTopAligned")
    ).toBe(true);
    expect(builtRender.container.querySelectorAll(".tbBar.built")).toHaveLength(1);
    expect(builtRender.container.querySelectorAll(".tbBar.unbuilt")).toHaveLength(6);
    expect(builtRender.container.querySelector(".tbBar.built .tbBarTileArt[src*='little-busters-bar-1']")).toBeTruthy();
  });

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

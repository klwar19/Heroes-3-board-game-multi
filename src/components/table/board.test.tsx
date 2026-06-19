// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BattlefieldBoard, COMBAT_BOARD_ART_VARIANTS, battlefieldCellPlacement, pickCombatBoardArt } from "./board";
import { CardZoomProvider } from "./zoom";
import {
  applyCombatBoardArtObstacles,
  assignCombatBoardArt,
  createInitialGameState,
  eligibleCombatBoardArtIds,
  SHIP_BATTLE_OBSTACLES,
  weightedCombatBoardArtIds,
  type GameAction,
  type GameState,
  type LegalAction
} from "@/engine";
import type { CardBoardAction } from "./utils";

afterEach(cleanup);

describe("combat board art variants", () => {
  function waterCombatState(seed = "board-art-water"): GameState {
    const state = createInitialGameState(seed);
    state.adventure = {
      fields: {
        sea_1: {
          spaceId: "sea_1",
          tileInstanceId: "tile_1",
          slot: 0,
          location: "open_sea",
          terrain: "water",
          blackCube: false,
          flagOwnerId: null,
          everFlagged: false,
          settlementResource: null
        }
      },
      tiles: {}
    } as unknown as GameState["adventure"];
    state.combat!.context = { kind: "neutral", heroId: "hero_p1", fieldId: "sea_1", difficulty: 1, hasAzure: false };
    return state;
  }

  it("declares the classic board plus themed combat board variants", () => {
    expect(COMBAT_BOARD_ART_VARIANTS.map((variant) => variant.id)).toEqual([
      "classic",
      "frozen",
      "hell-necro",
      "jungle-fortress",
      "castle-siege",
      "ship-battle"
    ]);
    expect(COMBAT_BOARD_ART_VARIANTS.map((variant) => variant.terrain)).toEqual([
      "/assets/board/battlefield-4x5-pro.png",
      "/assets/board/battlefield-4x5-frozen.webp",
      "/assets/board/battlefield-4x5-hell-necro.webp",
      "/assets/board/battlefield-4x5-jungle-fortress.webp",
      "/assets/board/battlefield-4x5-castle-siege.webp",
      "/assets/board/battlefield-4x5-ship-battle.webp"
    ]);
  });

  it("picks stable seeded art per combat id, while varying across combats", () => {
    const stable = createInitialGameState("board-art-seed");
    stable.combat!.id = "combat_7";
    expect(pickCombatBoardArt(stable)).toBe(pickCombatBoardArt(stable));

    const seen = new Set(
      Array.from({ length: 16 }, (_, index) => {
        const state = createInitialGameState("board-art-seed");
        state.combat!.id = `combat_${index}`;
        return pickCombatBoardArt(state).id;
      })
    );
    expect(seen.size).toBeGreaterThan(1);
  });

  it("only offers the ship board at sea and only offers the siege board in siege combat", () => {
    const normal = createInitialGameState("board-art-normal");
    expect(eligibleCombatBoardArtIds(normal, normal.combat)).not.toContain("ship-battle");
    expect(eligibleCombatBoardArtIds(normal, normal.combat)).not.toContain("castle-siege");

    const sea = waterCombatState();
    expect(eligibleCombatBoardArtIds(sea, sea.combat)).toContain("ship-battle");
    expect(eligibleCombatBoardArtIds(sea, sea.combat)).not.toContain("castle-siege");

    sea.combat!.context = {
      kind: "player",
      attackerHeroId: "hero_p1",
      defenderHeroId: "hero_p2",
      fieldId: "sea_1",
      siege: true
    };
    expect(eligibleCombatBoardArtIds(sea, sea.combat)).toContain("castle-siege");
    expect(eligibleCombatBoardArtIds(sea, sea.combat)).not.toContain("ship-battle");
  });

  it("weights snow for Tower and grim battlefields for Inferno or Necropolis", () => {
    const tower = createInitialGameState("board-art-tower");
    tower.players.p1.factionId = "tower";
    tower.players.p2.factionId = "castle";
    const towerPool = weightedCombatBoardArtIds(tower, tower.combat);
    expect(towerPool.filter((id) => id === "frozen")).toHaveLength(4);

    const grim = createInitialGameState("board-art-grim");
    grim.players.p1.factionId = "inferno";
    grim.players.p2.factionId = "castle";
    const grimPool = weightedCombatBoardArtIds(grim, grim.combat);
    expect(grimPool.filter((id) => id === "hell-necro")).toHaveLength(4);
  });

  it("adds real obstacle markers to the ship board water squares", () => {
    const state = waterCombatState("board-art-ship-obstacles");
    state.combat!.boardArtId = "ship-battle";
    state.combat!.obstacles = [];

    applyCombatBoardArtObstacles(state.combat!);

    expect(state.combat!.obstacles).toEqual([...SHIP_BATTLE_OBSTACLES]);
  });

  it("adds ship obstacles through the normal seeded board-art assignment path", () => {
    const state = waterCombatState("board-art-ship-assignment");
    let pickedShip = false;

    for (let index = 0; index < 80; index += 1) {
      state.combat!.id = `combat_${index}`;
      state.combat!.boardArtId = undefined;
      state.combat!.obstacles = [];
      assignCombatBoardArt(state, state.combat!);
      if (state.combat!.boardArtId === "ship-battle") {
        pickedShip = true;
        expect(state.combat!.obstacles).toEqual([...SHIP_BATTLE_OBSTACLES]);
        break;
      }
    }

    expect(pickedShip).toBe(true);
  });
});

/**
 * The battlefield is drawn horizontally: the engine's 4-wide × 5-tall logical
 * grid is transposed so the armies stand left↔right. The seat flip is a pure
 * horizontal mirror (rows never reverse), so cards stay upright on both sides.
 * These tests pin the mapping for both seats and the fact that it is actually
 * wired onto every rendered cell — remove either and they fail.
 */
describe("battlefieldCellPlacement — horizontal transpose", () => {
  it("unflipped: each engine row becomes a column, attacker on the left, defender on the right", () => {
    // Attacker back-line (engine row 4, positions 16-19) is the left-most column.
    expect(battlefieldCellPlacement(16, false)).toEqual({ gridColumn: 1, gridRow: 1 });
    expect(battlefieldCellPlacement(19, false)).toEqual({ gridColumn: 1, gridRow: 4 });
    // Attacker front-line (engine row 3) sits one column in.
    expect(battlefieldCellPlacement(12, false)).toEqual({ gridColumn: 2, gridRow: 1 });
    // The crossing (engine row 2) is the middle column.
    expect(battlefieldCellPlacement(8, false)).toEqual({ gridColumn: 3, gridRow: 1 });
    // Defender front-line (engine row 1) and back-line (engine row 0) on the right.
    expect(battlefieldCellPlacement(4, false)).toEqual({ gridColumn: 4, gridRow: 1 });
    expect(battlefieldCellPlacement(0, false)).toEqual({ gridColumn: 5, gridRow: 1 });
    expect(battlefieldCellPlacement(3, false)).toEqual({ gridColumn: 5, gridRow: 4 });
  });

  it("flipped: mirrors columns left↔right (own army to the left) while rows stay put", () => {
    // Columns are mirrored (col -> 6 - col); rows are identical, so nothing turns
    // upside-down. Attacker back-line moves from the left to the right column.
    expect(battlefieldCellPlacement(16, true)).toEqual({ gridColumn: 5, gridRow: 1 });
    expect(battlefieldCellPlacement(12, true)).toEqual({ gridColumn: 4, gridRow: 1 });
    expect(battlefieldCellPlacement(8, true)).toEqual({ gridColumn: 3, gridRow: 1 });
    expect(battlefieldCellPlacement(4, true)).toEqual({ gridColumn: 2, gridRow: 1 });
    expect(battlefieldCellPlacement(0, true)).toEqual({ gridColumn: 1, gridRow: 1 });
    expect(battlefieldCellPlacement(3, true)).toEqual({ gridColumn: 1, gridRow: 4 });
  });

  it("keeps each four-cell lane together in one column (rows never reverse)", () => {
    // Engine row 0 (positions 0-3) becomes a single column spanning rows 1-4.
    expect([0, 1, 2, 3].map((p) => battlefieldCellPlacement(p, false))).toEqual([
      { gridColumn: 5, gridRow: 1 },
      { gridColumn: 5, gridRow: 2 },
      { gridColumn: 5, gridRow: 3 },
      { gridColumn: 5, gridRow: 4 }
    ]);
  });
});

describe("BattlefieldBoard — horizontal cell placement", () => {
  it("places every cell on the transposed grid via inline grid-column / grid-row", () => {
    const state = createInitialGameState("board-horizontal");
    // The sandbox flips p1's seat, so the rendered cells use the mirrored map.
    render(
      <CardZoomProvider>
        <BattlefieldBoard
          state={state}
          viewerPlayerId="p1"
          legalActions={[]}
          selectedCardAction={null}
          onAction={vi.fn()}
          onInspect={() => {}}
        />
      </CardZoomProvider>
    );

    for (let position = 0; position < 20; position += 1) {
      const cell = document.querySelector<HTMLElement>(`[data-fx-cell="${position}"]`);
      expect(cell, `cell ${position} should render`).toBeTruthy();
      const { gridColumn, gridRow } = battlefieldCellPlacement(position, true);
      expect(cell!.style.gridColumn, `cell ${position} column`).toBe(String(gridColumn));
      expect(cell!.style.gridRow, `cell ${position} row`).toBe(String(gridRow));
    }
  });
});

/**
 * Regression test for the space-target cast fix: an area spell that selects a
 * SPACE (Inferno / Frost Ring / Xyron's Inferno) must be castable on a space
 * that HOLDS a unit, not only on empty cells. Before the fix, board.tsx only
 * resolved the space-target action for empty cells (`!unit`), so a stack of
 * units standing on the chosen centre could never be clicked.
 */
describe("BattlefieldBoard — area spells target occupied spaces", () => {
  function renderBoardWithInfernoSelected() {
    const state = createInitialGameState("board-occupied-space");
    // Put an enemy unit ON the space we will aim the blast at (position 9).
    state.combat!.units.unit_p2_skeletons.position = 9;

    const castOnOccupied: GameAction = {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.inferno",
      target: { type: "space", position: 9 }
    };
    const selectedCardAction = castOnOccupied as CardBoardAction;
    const legalActions: LegalAction[] = [{ label: "Inferno: cast on B3", action: castOnOccupied }];
    const onAction = vi.fn();

    render(
      <CardZoomProvider>
        <BattlefieldBoard
          state={state}
          viewerPlayerId="p1"
          legalActions={legalActions}
          selectedCardAction={selectedCardAction}
          onAction={onAction}
          onInspect={() => {}}
        />
      </CardZoomProvider>
    );
    return { onAction, castOnOccupied };
  }

  it("renders the occupied centre cell as a clickable cast target and fires the cast", () => {
    const { onAction, castOnOccupied } = renderBoardWithInfernoSelected();

    // The cell at the skeletons' space is a "Cast on …" button (it was inert
    // before the fix because the space had a unit on it).
    const cell = document.querySelector<HTMLButtonElement>('button[data-fx-cell="9"]');
    expect(cell, "the occupied centre cell should be a button").toBeTruthy();
    expect(cell!.getAttribute("aria-label")).toMatch(/Cast on/i);

    fireEvent.click(cell!);
    expect(onAction).toHaveBeenCalledWith(castOnOccupied);
  });
});

describe("BattlefieldBoard — battlefield-obstacle spell tokens", () => {
  function renderBoard(state: ReturnType<typeof createInitialGameState>, onAction = vi.fn()) {
    render(
      <CardZoomProvider>
        <BattlefieldBoard
          state={state}
          viewerPlayerId="p1"
          legalActions={[]}
          selectedCardAction={null}
          onAction={onAction}
          onInspect={() => {}}
        />
      </CardZoomProvider>
    );
    return { onAction };
  }

  // Each visible obstacle / the caster's own trap draws its converted H3 sprite,
  // not the old emoji. The Force Field is the blue energy barrier (C15SPE) and
  // Quicksand the sandy pit (C17SPE) — they were swapped in the first conversion,
  // so the Force Field must NOT resolve to the quicksand asset, and vice-versa.
  function spriteOnCell(position: number): HTMLElement | null {
    return document.querySelector<HTMLElement>(`[data-fx-cell="${position}"] .battlefieldToken .battlefieldTokenSprite`);
  }

  it("draws a Fire Wall with its flame sprite and its damage", () => {
    const state = createInitialGameState("board-fire-wall");
    state.combat!.battlefieldTokens = [{ id: "t1", kind: "fire_wall", position: 10, controllerId: "p1", damage: 2 }];
    renderBoard(state);
    const mark = document.querySelector('[data-fx-cell="10"] .battlefieldToken.fire_wall');
    expect(mark, "a Fire Wall marker should render on space 10").toBeTruthy();
    expect(mark!.textContent).toContain("2");
    expect(spriteOnCell(10)!.style.backgroundImage).toContain("fire-wall");
    expect(mark!.textContent ?? "").not.toContain("🔥");
  });

  it("renders the Force Field as the blue-barrier sprite (not the sandy quicksand art)", () => {
    const state = createInitialGameState("board-force-field");
    state.combat!.battlefieldTokens = [{ id: "t1", kind: "force_field", position: 10, controllerId: "p1" }];
    renderBoard(state);
    const mark = document.querySelector('[data-fx-cell="10"] .battlefieldToken.force_field');
    expect(mark, "a Force Field marker should render on space 10").toBeTruthy();
    const bg = spriteOnCell(10)!.style.backgroundImage;
    expect(bg).toContain("force-field");
    expect(bg).not.toContain("quicksand");
    expect(mark!.textContent ?? "").not.toContain("🛡");
  });

  it("renders the caster's Quicksand as the sandy sprite (not the blue force-field art)", () => {
    const state = createInitialGameState("board-quicksand");
    state.combat!.battlefieldTokens = [{ id: "t1", kind: "quicksand", position: 10, controllerId: "p1", armed: true }];
    renderBoard(state);
    const mark = document.querySelector('[data-fx-cell="10"] .battlefieldToken.quicksand');
    expect(mark, "a Quicksand marker should render on space 10").toBeTruthy();
    const bg = spriteOnCell(10)!.style.backgroundImage;
    expect(bg).toContain("quicksand");
    expect(bg).not.toContain("force-field");
    expect(mark!.textContent ?? "").not.toContain("🌀");
  });

  it("shows the opponent only a face-down token back, the caster the real Land Mine sprite", () => {
    const hiddenState = createInitialGameState("board-hidden-trap");
    // armed === undefined mirrors what getPlayerView leaves for an enemy trap.
    hiddenState.combat!.battlefieldTokens = [{ id: "t1", kind: "land_mine", position: 10, controllerId: "p2" }];
    renderBoard(hiddenState);
    const hidden = document.querySelector('[data-fx-cell="10"] .battlefieldToken');
    expect(hidden!.className).toContain("faceDown");
    expect(hidden!.querySelector(".battlefieldTokenBack"), "a face-down back hides the trap").toBeTruthy();
    expect(hidden!.querySelector(".battlefieldTokenSprite"), "no sprite leaks the trap to the opponent").toBeNull();

    cleanup();

    const ownState = createInitialGameState("board-own-trap");
    ownState.combat!.battlefieldTokens = [
      { id: "t1", kind: "land_mine", position: 10, controllerId: "p1", armed: true, damage: 2 }
    ];
    renderBoard(ownState);
    const own = document.querySelector('[data-fx-cell="10"] .battlefieldToken');
    expect(own!.className).not.toContain("faceDown");
    expect(own!.textContent ?? "").toContain("armed");
    // A dormant mine shows the STATIC placed-mine frame (land-mine-b), never the
    // igniting/detonation animations (land-mine-a / -c). Those would loop the
    // mine sparking forever; the real blast is land-mine-hit, played only when
    // the mine is sprung (see the BATTLEFIELD_TOKEN_TRIGGERED tests in page.tsx).
    const bg = spriteOnCell(10)!.style.backgroundImage;
    expect(bg).toContain("land-mine-b");
    expect(bg).not.toContain("land-mine-a");
    expect(bg).not.toContain("land-mine-c");
    expect(bg).not.toContain("land-mine-hit");
  });

  // A dormant trap must hold its idle frame, not loop its sheet: a Land Mine
  // must not perpetually spark nor a Quicksand pit endlessly bubble while it
  // waits to be sprung. TokenSprite drives its loop with requestAnimationFrame,
  // so a trap that animates schedules a frame and a static one never does. The
  // visible obstacles (Fire Wall flames) DO keep animating, which pins that the
  // gate is the trap/obstacle distinction and not "nothing animates".
  it("holds traps on a static idle frame (no animation loop), while visible obstacles still animate", () => {
    const rafSpy = vi.spyOn(window, "requestAnimationFrame");

    const fireWall = createInitialGameState("board-anim-fire-wall");
    fireWall.combat!.battlefieldTokens = [{ id: "fw", kind: "fire_wall", position: 10, controllerId: "p1", damage: 2 }];
    rafSpy.mockClear();
    renderBoard(fireWall);
    expect(spriteOnCell(10), "the Fire Wall draws its animated sprite").toBeTruthy();
    expect(rafSpy, "a visible obstacle keeps animating").toHaveBeenCalled();
    cleanup();

    for (const kind of ["land_mine", "quicksand"] as const) {
      const trap = createInitialGameState(`board-anim-${kind}`);
      trap.combat!.battlefieldTokens = [{ id: "t", kind, position: 10, controllerId: "p1", armed: true, damage: 2 }];
      rafSpy.mockClear();
      renderBoard(trap);
      expect(spriteOnCell(10), `the caster's ${kind} still draws its sprite`).toBeTruthy();
      expect(rafSpy, `the dormant ${kind} must not loop its sheet`).not.toHaveBeenCalled();
      cleanup();
    }

    rafSpy.mockRestore();
  });

  it("runs the placement picker: empty cells place a token and a Stop button ends it", () => {
    const state = createInitialGameState("board-place-picker");
    state.combat!.activeUnitId = "unit_p1_crusaders";
    state.phase = "choice";
    state.priorityPlayerId = "p1";
    state.pendingChoice = {
      id: "choice_place",
      type: "OPTION_CHOICE",
      playerId: "p1",
      prompt: "Quicksand: place a token on an empty space (1 left), or stop.",
      options: [{ label: "Place at C1" }, { label: "Stop placing tokens" }],
      context: "place-battlefield-tokens",
      placeTokens: { kind: "quicksand", positions: [10], armedSlots: [true, false], placedCount: 1, remaining: 1, triggerDamage: 0 },
      returnPhase: "combat"
    };
    const { onAction } = renderBoard(state);

    // The offered empty space is a clickable placement target.
    const cell = document.querySelector<HTMLButtonElement>('button[data-fx-cell="10"]');
    expect(cell!.getAttribute("aria-label")).toMatch(/Place token on/i);
    fireEvent.click(cell!);
    expect(onAction).toHaveBeenCalledWith({ type: "CHOOSE_OPTION", playerId: "p1", choiceId: "choice_place", optionIndex: 0 });

    // The "Stop placing tokens" banner button submits the trailing option.
    const stop = Array.from(document.querySelectorAll("button")).find((b) => /stop placing/i.test(b.textContent ?? ""));
    expect(stop, "a Stop placing button should render").toBeTruthy();
    fireEvent.click(stop!);
    expect(onAction).toHaveBeenCalledWith({ type: "CHOOSE_OPTION", playerId: "p1", choiceId: "choice_place", optionIndex: 1 });
  });
});

describe("BattlefieldBoard — move route planner (Fire Wall on the field)", () => {
  function byText(re: RegExp): HTMLButtonElement | undefined {
    return Array.from(document.querySelectorAll("button")).find((b) => re.test(b.textContent ?? "")) as
      | HTMLButtonElement
      | undefined;
  }

  it("lets the player hand-pick a route and walks it as MOVE_UNIT with an explicit path", () => {
    const state = createInitialGameState("board-route");
    state.combat!.obstacles = [];
    state.combat!.activeUnitId = "unit_p1_crusaders";
    const mover = state.combat!.units.unit_p1_crusaders;
    mover.position = 0;
    mover.activatedThisRound = false;
    mover.movedThisActivation = false;
    // A Fire Wall on the field is what surfaces the planner.
    state.combat!.battlefieldTokens = [{ id: "fw", kind: "fire_wall", position: 1, controllerId: "p2", damage: 3 }];
    // The active unit's legal moves (the board builds its destination set from these).
    const legalActions: LegalAction[] = [1, 2, 4].map((destination) => ({
      label: `Move to ${destination}`,
      action: { type: "MOVE_UNIT", playerId: "p1", unitId: "unit_p1_crusaders", destination }
    }));
    const onAction = vi.fn();
    render(
      <CardZoomProvider>
        <BattlefieldBoard
          state={state}
          viewerPlayerId="p1"
          legalActions={legalActions}
          selectedCardAction={null}
          onAction={onAction}
          onInspect={() => {}}
        />
      </CardZoomProvider>
    );

    // The planner is offered because a Fire Wall stands on the board.
    const planBtn = byText(/plan route/i);
    expect(planBtn, "a Plan route button should appear").toBeTruthy();
    fireEvent.click(planBtn!);

    // Cell 1 (the Fire Wall, adjacent to the unit) is now a route step — pick it.
    const cell1 = document.querySelector<HTMLButtonElement>('button[data-fx-cell="1"]');
    expect(cell1!.getAttribute("aria-label")).toMatch(/route/i);
    fireEvent.click(cell1!);

    // Walking the chosen route emits MOVE_UNIT carrying the explicit path.
    const walkBtn = byText(/walk route/i);
    expect(walkBtn, "a Walk route button should appear once a step is chosen").toBeTruthy();
    fireEvent.click(walkBtn!);
    expect(onAction).toHaveBeenCalledWith({
      type: "MOVE_UNIT",
      playerId: "p1",
      unitId: "unit_p1_crusaders",
      destination: 1,
      path: [1]
    });
  });

  it("does not offer the planner when no Fire Wall is on the board", () => {
    const state = createInitialGameState("board-noroute");
    state.combat!.obstacles = [];
    state.combat!.activeUnitId = "unit_p1_crusaders";
    state.combat!.units.unit_p1_crusaders.position = 0;
    state.combat!.units.unit_p1_crusaders.activatedThisRound = false;
    state.combat!.battlefieldTokens = [];
    const legalActions: LegalAction[] = [
      { label: "Move to 1", action: { type: "MOVE_UNIT", playerId: "p1", unitId: "unit_p1_crusaders", destination: 1 } }
    ];
    render(
      <CardZoomProvider>
        <BattlefieldBoard
          state={state}
          viewerPlayerId="p1"
          legalActions={legalActions}
          selectedCardAction={null}
          onAction={vi.fn()}
          onInspect={() => {}}
        />
      </CardZoomProvider>
    );
    expect(byText(/plan route/i), "no planner without a Fire Wall").toBeUndefined();
  });
});

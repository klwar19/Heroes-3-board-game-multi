// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BattlefieldBoard, COMBAT_BOARD_ART_VARIANTS, CommandDock, InspectPanel, battlefieldCellPlacement, pickCombatBoardArt } from "./board";
import { CardZoomProvider } from "./zoom";
import {
  applyCombatBoardArtObstacles,
  assignCombatBoardArt,
  commanderUnitId,
  createInitialGameState,
  eligibleCombatBoardArtIds,
  fortificationTargetId,
  gainRunes,
  getLegalActions,
  makeActiveEffect,
  RUNE_LEVEL_THRESHOLDS,
  isCreatureBankCombat,
  makeArrowTowerUnit,
  makeCommanderCombatUnit,
  NEUTRAL_PLAYER_ID,
  SHIP_BATTLE_OBSTACLES,
  weightedCombatBoardArtIds,
  type ActiveEffectModifier,
  type CombatBoardArtId,
  type GameAction,
  type GameState,
  type LegalAction
} from "@/engine";
import { CREATURE_BANK_IDS } from "@/data/map/creature-banks";
import { coreUnitDefinitions } from "@/data/factions/units";
import { placeCombatToken } from "@/engine/tokens";
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

  // A real Creature Bank field: `location` is the literal "creature_bank" and the
  // bank's identity lives in `bankId` (see fieldCreatureBankId). The neutral
  // combat context carries the same `bankId`, which is the signal the board-art
  // gate keys on. This mirrors how beginNeutralCombatPlacement builds the context.
  function creatureBankCombatState(bankId: string, seed = `board-art-${bankId}`): GameState {
    const state = createInitialGameState(seed);
    state.adventure = {
      fields: {
        bank_1: {
          spaceId: "bank_1",
          tileInstanceId: "tile_1",
          slot: 0,
          location: "creature_bank",
          bankId,
          terrain: "subterranean",
          blackCube: false,
          flagOwnerId: null,
          everFlagged: false,
          settlementResource: null
        }
      },
      tiles: {}
    } as unknown as GameState["adventure"];
    state.combat!.context = {
      kind: "neutral",
      heroId: "hero_p1",
      fieldId: "bank_1",
      difficulty: 7,
      hasAzure: false,
      bankId
    };
    return state;
  }

  it("declares the classic board plus themed combat board variants", () => {
    expect(COMBAT_BOARD_ART_VARIANTS.map((variant) => variant.id)).toEqual([
      "classic",
      "frozen",
      "hell-necro",
      "jungle-fortress",
      "creature-bank-dungeon",
      "pve-calamity-classic",
      "pve-calamity-doom",
      "castle-siege",
      "ship-battle"
    ]);
    expect(COMBAT_BOARD_ART_VARIANTS.map((variant) => variant.terrain)).toEqual([
      "/assets/board/battlefield-4x5-pro.webp",
      "/assets/board/battlefield-4x5-frozen.webp",
      "/assets/board/battlefield-4x5-hell-necro.webp",
      "/assets/board/battlefield-4x5-jungle-fortress.webp",
      "/assets/board/battlefield-4x5-creature-bank-dungeon.webp",
      "/assets/board/battlefield-4x5-pve-calamity-classic.webp",
      "/assets/board/battlefield-4x5-pve-calamity-doom.webp",
      "/assets/board/battlefield-4x5-castle-siege.webp",
      "/assets/board/battlefield-4x5-ship-battle.webp"
    ]);
  });

  it("reserves the two calamity boards for wave, raid-boss, and dungeon combats", () => {
    const contexts = [
      { waveAssault: { wave: 2 } },
      { raidBossId: "raid_goblin" },
      { dungeonFloor: 5 }
    ] as const;

    for (const theme of ["classic", "doom"] as const) {
      for (const mark of contexts) {
        const state = createInitialGameState(`pve-board-${theme}-${Object.keys(mark)[0]}`);
        state.adventure = {
          fields: {},
          tiles: {},
          pveTheme: theme
        } as unknown as GameState["adventure"];
        state.combat!.context = {
          kind: "neutral",
          heroId: "hero_p1",
          fieldId: "pve_field",
          difficulty: 0,
          hasAzure: false,
          ...mark
        };
        state.combat!.boardArtId = undefined;
        const expected = theme === "doom" ? "pve-calamity-doom" : "pve-calamity-classic";
        expect(eligibleCombatBoardArtIds(state, state.combat)).toEqual([expected]);
        expect(pickCombatBoardArt(state).id).toBe(expected);
      }
    }

    const ordinary = createInitialGameState("pve-board-ordinary");
    expect(eligibleCombatBoardArtIds(ordinary, ordinary.combat)).not.toContain("pve-calamity-classic");
    expect(eligibleCombatBoardArtIds(ordinary, ordinary.combat)).not.toContain("pve-calamity-doom");
  });

  it("renders the calamity terrain art + its encounter plate; an ordinary board renders neither", () => {
    // The VISIBLE half of the PvE board (jsdom cannot compute CSS, so this pins
    // the DOM wiring): the frame carries the board id, the terrain <img> points
    // at that board's own webp, and the encounter plate names the theme.
    function renderBoard(seed: string, boardArtId: CombatBoardArtId) {
      const state = createInitialGameState(seed);
      state.combat!.boardArtId = boardArtId;
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
    }

    renderBoard("pve-plate-doom", "pve-calamity-doom");
    const doomFrame = document.querySelector('.battlefieldFrame[data-board-art="pve-calamity-doom"]');
    expect(doomFrame).toBeTruthy();
    expect(doomFrame?.querySelector("img.battlefieldTerrain")?.getAttribute("src")).toContain(
      "battlefield-4x5-pve-calamity-doom.webp"
    );
    expect(document.querySelector(".pveBattlefieldTitle")?.textContent).toContain("The Infernal Breach");
    cleanup();

    renderBoard("pve-plate-classic", "pve-calamity-classic");
    expect(document.querySelector(".pveBattlefieldTitle")?.textContent).toContain("The Shattered Rift");
    expect(
      document
        .querySelector('.battlefieldFrame[data-board-art="pve-calamity-classic"] img.battlefieldTerrain')
        ?.getAttribute("src")
    ).toContain("battlefield-4x5-pve-calamity-classic.webp");
    cleanup();

    // CONTROL: an ordinary battlefield keeps its own art and shows NO plate.
    renderBoard("pve-plate-control", "frozen");
    expect(document.querySelector(".pveBattlefieldTitle")).toBeNull();
    expect(
      document.querySelector('.battlefieldFrame[data-board-art="frozen"] img.battlefieldTerrain')
        ?.getAttribute("src")
    ).toContain("battlefield-4x5-frozen.webp");
  });

  it("fights EVERY Creature Bank on the dungeon board (all current and future banks)", () => {
    // Iterate the real bank registry, not a hand-picked subset: a bank added to
    // CREATURE_BANK_IDS later is covered automatically, so this fails if a future
    // bank ever falls through to a random open-field battlefield.
    expect(CREATURE_BANK_IDS.length).toBeGreaterThanOrEqual(12);
    for (const bankId of CREATURE_BANK_IDS) {
      const state = creatureBankCombatState(bankId);
      expect(isCreatureBankCombat(state.combat)).toBe(true);
      expect(eligibleCombatBoardArtIds(state, state.combat)).toEqual(["creature-bank-dungeon"]);
      // Seed/combat-id must never matter: the dungeon board is forced, like a siege.
      for (let index = 0; index < 8; index += 1) {
        state.combat!.id = `combat_${index}`;
        state.combat!.boardArtId = undefined;
        expect(pickCombatBoardArt(state).id).toBe("creature-bank-dungeon");
      }
    }
  });

  it("never shows the dungeon board for an ordinary (non-bank) neutral fight", () => {
    // A Field-Difficulty neutral fight has no bankId, so the gate must reject it —
    // otherwise the dungeon board would leak onto every guard fight on the map.
    const plain = createInitialGameState("board-art-plain-neutral");
    plain.combat!.context = { kind: "neutral", heroId: "hero_p1", fieldId: "0,0", difficulty: 5, hasAzure: false };
    expect(isCreatureBankCombat(plain.combat)).toBe(false);
    expect(eligibleCombatBoardArtIds(plain, plain.combat)).not.toContain("creature-bank-dungeon");

    // An unknown/garbage bankId is not a real bank either (isCreatureBankId guards it).
    const bogus = creatureBankCombatState("not_a_real_bank", "board-art-bogus-bank");
    expect(isCreatureBankCombat(bogus.combat)).toBe(false);
    expect(eligibleCombatBoardArtIds(bogus, bogus.combat)).not.toContain("creature-bank-dungeon");
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

  it("always fights a siege on the castle board (never a random battlefield)", () => {
    const state = createInitialGameState("board-art-siege");
    state.combat!.context = {
      kind: "player",
      attackerHeroId: "hero_p1",
      defenderHeroId: "hero_p2",
      fieldId: "0,0",
      siege: true
    };
    // Whatever the combat id / seed, a siege is the castle board every time —
    // the defender stands on the castle side behind the Walls and Gate.
    for (let index = 0; index < 16; index += 1) {
      state.combat!.id = `combat_${index}`;
      state.combat!.boardArtId = undefined;
      expect(pickCombatBoardArt(state).id).toBe("castle-siege");
    }
  });

  it("always fights a sea combat on the ship board (never a random land battlefield)", () => {
    // A fight on a water hex is naval — the ship board is FORCED, exactly like a
    // siege or a bank, not merely weighted into the open-field pool. The eligible
    // set is the ship board alone, and whatever the combat id / seed the pick is
    // always the ship board.
    const sea = waterCombatState("board-art-sea-forced");
    expect(eligibleCombatBoardArtIds(sea, sea.combat)).toEqual(["ship-battle"]);
    for (let index = 0; index < 16; index += 1) {
      sea.combat!.id = `combat_${index}`;
      sea.combat!.boardArtId = undefined;
      expect(pickCombatBoardArt(sea).id).toBe("ship-battle");
    }

    // CONTROL: an identical fight on a LAND hex is NOT forced to the ship board —
    // it varies across combat ids (the seeded land-battlefield pool), proving the
    // force is gated on the water terrain and not applied everywhere.
    const land = waterCombatState("board-art-sea-control");
    land.adventure!.fields.sea_1.terrain = undefined;
    const landPicks = new Set(
      Array.from({ length: 16 }, (_, index) => {
        land.combat!.id = `combat_${index}`;
        land.combat!.boardArtId = undefined;
        return pickCombatBoardArt(land).id;
      })
    );
    expect(landPicks.has("ship-battle")).toBe(false);
    expect(landPicks.size).toBeGreaterThan(1);
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

  it("prints A-D and 1-5 on both outer edges, mirrored to the same cells as the viewer", () => {
    const state = createInitialGameState("coordinate-guide");
    const { container } = render(
      <CardZoomProvider>
        <BattlefieldBoard
          legalActions={getLegalActions(state, "p1")}
          onAction={vi.fn()}
          onInspect={() => {}}
          selectedCardAction={null}
          state={state}
          viewerPlayerId="p1"
        />
      </CardZoomProvider>
    );

    expect(container.querySelector('[aria-label="Battlefield coordinate guide"]')).toBeTruthy();
    for (const side of ["left", "right"]) {
      const letters = [...container.querySelectorAll(`[data-coordinate-axis="letter-${side}"]`)].map(
        (node) => node.textContent
      );
      expect(letters).toEqual(["A", "B", "C", "D"]);
    }
    for (const edge of ["top", "bottom"]) {
      const numbers = [...container.querySelectorAll<HTMLElement>(`[data-coordinate-axis="number-${edge}"]`)];
      expect(numbers.map((node) => node.textContent)).toEqual(["1", "2", "3", "4", "5"]);
      numbers.forEach((node, engineRow) => {
        expect(node.style.gridColumn).toBe(String(battlefieldCellPlacement(engineRow * 4, true).gridColumn));
      });
    }
  });
});

describe("manual Neutral control - real battlefield controls", () => {
  function controlledNeutralScene(): { state: GameState; guardId: string } {
    const state = createInitialGameState("manual-neutral-board");
    state.adventure = {
      fields: {},
      tiles: {},
      manualGuardControl: true
    } as unknown as GameState["adventure"];
    const combat = state.combat!;
    combat.context = {
      kind: "neutral",
      heroId: "hero_p1",
      fieldId: "guard-field",
      difficulty: 1,
      hasAzure: false
    };
    combat.attackerPlayerId = "p1";
    combat.defenderPlayerId = NEUTRAL_PLAYER_ID;
    combat.setup = null;
    combat.outcome = null;
    state.phase = "combat";
    state.pendingChoice = null;
    state.reactionWindow = null;
    state.stack = [];

    const guard = combat.units.unit_p2_skeletons;
    guard.controllerId = NEUTRAL_PLAYER_ID;
    guard.position = 5;
    guard.activatedThisRound = false;
    guard.movedThisActivation = false;
    guard.attackedThisActivation = false;
    guard.reactionPauseAcked = true;
    const target = combat.units.unit_p1_marksmen;
    target.position = 1;
    for (const unit of Object.values(combat.units)) {
      if (unit.id !== guard.id && unit.id !== target.id) {
        unit.damage = unit.maxHealth;
      }
    }
    combat.activeUnitId = guard.id;
    // The reducer publishes p1 as decision owner without changing the guard's
    // Neutral army controller.
    state.activePlayerId = "p1";
    state.priorityPlayerId = "p1";
    return { state, guardId: guard.id };
  }

  it("shows the controlled guard as active and dispatches its board attack as the player seat", () => {
    const { state, guardId } = controlledNeutralScene();
    const legalActions = getLegalActions(state, "p1");
    const attack = legalActions.find(
      (legal) => legal.action.type === "ATTACK_UNIT" && legal.action.attackerId === guardId
    );
    expect(attack, "the engine should offer the guard attack to p1").toBeTruthy();
    const onAction = vi.fn();
    const { container } = render(
      <CardZoomProvider>
        <>
          <BattlefieldBoard
            legalActions={legalActions}
            onAction={onAction}
            onInspect={() => {}}
            selectedCardAction={null}
            state={state}
            viewerPlayerId="p1"
          />
          <CommandDock legalActions={legalActions} onAction={onAction} state={state} viewerPlayerId="p1" />
        </>
      </CardZoomProvider>
    );

    expect(container.querySelector(".dockStatus")?.textContent).toContain(
      `${state.combat!.units[guardId].name} is active`
    );
    const attackButton = container.querySelector<HTMLButtonElement>(
      `[aria-label="Attack ${state.combat!.units.unit_p1_marksmen.name}"]`
    );
    expect(attackButton, "the enemy card should be a clickable attack target").toBeTruthy();
    fireEvent.click(attackButton!);
    expect(onAction).toHaveBeenCalledWith(attack!.action);
    expect([...container.querySelectorAll("button")].some((button) => button.textContent?.includes("Defend"))).toBe(true);
    expect(
      [...container.querySelectorAll("button")].some((button) => button.textContent?.includes("automatic"))
    ).toBe(true);
  });
});

/**
 * Regression test for the space-target cast fix: an area spell that selects a
 * SPACE (Inferno / Frost Ring / Xyron's Inferno) must be castable on a space
 * that HOLDS a unit, not only on empty cells. Before the fix, board.tsx only
 * resolved the space-target action for empty cells (`!unit`), so a stack of
 * units standing on the chosen centre could never be clicked.
 */
describe("BattlefieldBoard — Expert Tactics is one board control, not a menu of pairwise buttons", () => {
  // Expert Tactics surfaces in the engine as several SWAP_COMBAT_UNITS legal
  // actions (one per pair) OUTSIDE the start-of-combat setup window. The UI must
  // collapse them into a single opt-in board control and keep the verbose
  // pairwise buttons OUT of the command menu. (The engine offering itself is
  // covered by tactics-diplomacy.test.ts; here we pin the presentation.)
  function expertSwapLegalActions(): LegalAction[] {
    const pair = (a: string, b: string, label: string): LegalAction => ({
      label,
      action: { type: "SWAP_COMBAT_UNITS", playerId: "p1", unitIdA: a, unitIdB: b }
    });
    return [
      pair("unit_p1_marksmen", "unit_p1_griffins", "Tactics (expert): switch Marksmen (A2) and Griffins (B2)"),
      pair("unit_p1_marksmen", "unit_p1_crusaders", "Tactics (expert): switch Marksmen (A2) and Crusaders (C2)"),
      pair("unit_p1_griffins", "unit_p1_crusaders", "Tactics (expert): switch Griffins (B2) and Crusaders (C2)")
    ];
  }

  it("collapses the expert swaps into one board control and clicking it arms board-click", () => {
    const state = createInitialGameState("expert-tactics-ui"); // no pendingTacticsSwaps ⇒ not the setup window
    const { container: board } = render(
      <CardZoomProvider>
        <BattlefieldBoard
          legalActions={expertSwapLegalActions()}
          onAction={vi.fn()}
          onInspect={() => {}}
          selectedCardAction={null}
          state={state}
          viewerPlayerId="p1"
        />
      </CardZoomProvider>
    );
    // One clear opt-in control on the board (not three pairwise buttons)…
    const banner = board.querySelector('[aria-label="Expert Tactics"]');
    expect(banner, "the expert-Tactics board control should appear").toBeTruthy();
    const toggle = banner!.querySelector("button");
    expect(toggle?.textContent).toMatch(/switch two units/i);
    // …and arming it switches to the board-click instruction (no pairwise text).
    fireEvent.click(toggle!);
    expect(board.querySelector('[aria-label="Expert Tactics"]')?.textContent).toMatch(/click one of your units/i);
  });

  it("keeps the verbose pairwise swap buttons OUT of the command dock", () => {
    const state = createInitialGameState("expert-tactics-dock");
    const { container: dock } = render(
      <CardZoomProvider>
        <CommandDock
          legalActions={expertSwapLegalActions()}
          onAction={vi.fn()}
          state={state}
          viewerPlayerId="p1"
        />
      </CardZoomProvider>
    );
    const pairwise = [...dock.querySelectorAll("button")].filter((b) => /switch .+ and .+/i.test(b.textContent ?? ""));
    expect(pairwise, "no pairwise Tactics buttons should clutter the command menu").toHaveLength(0);
  });
});

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

describe("BattlefieldBoard — PvP Neutral Control pre-battle formation sort", () => {
  // The controller sees the Neutral guards as draggable (to sort the formation),
  // the empty defender cells as drop targets, and a "Ready for battle" command —
  // exactly like a defender deploying. The engine wiring is pinned in
  // pvp-neutral-control.test.ts; here we pin the board presentation.
  function sortState(): GameState {
    const state = createInitialGameState("pnc-sort-ui");
    // The controller (viewer p1) is not the attacker, so placementCellsFor is the
    // defender zone (0-7) — the sort area. Isolate a single Neutral guard on it.
    state.combat!.attackerPlayerId = "p2";
    state.combat!.pendingNeutralPlacement = "p1";
    const guard = state.combat!.units.unit_p2_skeletons;
    guard.controllerId = "neutrals";
    guard.position = 1;
    state.combat!.units = { [guard.id]: guard };
    return state;
  }

  it("makes the Neutral guards draggable and empty defender cells drop targets for the controller", () => {
    const { container } = render(
      <CardZoomProvider>
        <BattlefieldBoard
          state={sortState()}
          viewerPlayerId="p1"
          legalActions={[]}
          selectedCardAction={null}
          onAction={vi.fn()}
          onInspect={() => {}}
        />
      </CardZoomProvider>
    );
    expect(container.querySelector(".unitDraggable"), "the Neutral guard should be draggable to sort").toBeTruthy();
    expect(
      container.querySelectorAll(".dropTarget").length,
      "empty defender cells should accept a drop"
    ).toBeGreaterThan(0);
  });

  it("shows the 'Ready for battle' command that finishes the sort", () => {
    const finish: LegalAction = {
      label: "Ready for battle",
      action: { type: "FINISH_NEUTRAL_PLACEMENT", playerId: "p1" }
    };
    const onAction = vi.fn();
    const { container } = render(
      <CardZoomProvider>
        <CommandDock legalActions={[finish]} onAction={onAction} state={sortState()} viewerPlayerId="p1" />
      </CardZoomProvider>
    );
    const button = [...container.querySelectorAll("button")].find((entry) => /ready for battle/i.test(entry.textContent ?? ""));
    expect(button, "the Ready-for-battle button should render").toBeTruthy();
    fireEvent.click(button!);
    expect(onAction).toHaveBeenCalledWith(finish.action);
  });
});

describe("BattlefieldBoard — WOG Commanders pre-combat sort", () => {
  // The owner sees their own commander as draggable and its empty deployment-zone
  // cells as drop targets, plus a "Ready for battle" command. The engine wiring is
  // pinned in wog-commanders.test.ts; here we pin the board presentation.
  function commanderSortState(): GameState {
    const state = createInitialGameState("cmd-sort-ui");
    state.wog = { enabled: true, commanders: true, newObjects: false, newCreatures: false, artifacts: false };
    state.players.p1.commander = {
      slug: "corsair",
      grades: { attack: 0, defense: 0, health: 0, damage: 0, magic: 0, speed: 0 }
    };
    const commander = makeCommanderCombatUnit(state.players.p1, 16)!;
    // Leave only the commander plus a lone enemy so the whole attacker zone is open.
    const enemy = state.combat!.units.unit_p2_skeletons;
    enemy.position = 0;
    state.combat!.units = { [commander.id]: commander, [enemy.id]: enemy };
    state.combat!.obstacles = [];
    state.combat!.pendingCommanderPlacement = ["p1"];
    return state;
  }

  it("makes the owner's commander draggable and its empty zone cells drop targets", () => {
    const { container } = render(
      <CardZoomProvider>
        <BattlefieldBoard
          state={commanderSortState()}
          viewerPlayerId="p1"
          legalActions={[]}
          selectedCardAction={null}
          onAction={vi.fn()}
          onInspect={() => {}}
        />
      </CardZoomProvider>
    );
    expect(container.querySelector(".unitDraggable"), "the commander should be draggable to sort").toBeTruthy();
    expect(
      container.querySelectorAll(".dropTarget").length,
      "empty deployment-zone cells should accept a drop"
    ).toBeGreaterThan(0);
  });

  it("shows the 'Ready for battle' command that finishes the commander sort", () => {
    const finish: LegalAction = {
      label: "Ready for battle",
      action: { type: "FINISH_COMMANDER_PLACEMENT", playerId: "p1" }
    };
    const onAction = vi.fn();
    const { container } = render(
      <CardZoomProvider>
        <CommandDock legalActions={[finish]} onAction={onAction} state={commanderSortState()} viewerPlayerId="p1" />
      </CardZoomProvider>
    );
    const button = [...container.querySelectorAll("button")].find((entry) => /ready for battle/i.test(entry.textContent ?? ""));
    expect(button, "the Ready-for-battle button should render").toBeTruthy();
    fireEvent.click(button!);
    expect(onAction).toHaveBeenCalledWith(finish.action);
  });
});

describe("BattlefieldBoard — Creature Bank Stack Token badge", () => {
  function renderWithToken(seed: string, stat: "attack" | "defense" | "health" | "initiative") {
    const state = createInitialGameState(seed);
    state.combat!.units.unit_p2_skeletons.stackToken = stat;
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
  }

  it("shows exactly one gold badge naming the boosted statistic", () => {
    renderWithToken("bank-badge-hp", "health");
    const badges = document.querySelectorAll(".stackTokenBadge");
    expect(badges).toHaveLength(1);
    expect(badges[0].textContent).toBe("+1 HP");
  });

  it("uses +2 INI for an initiative token and +1 ATK for an attack token", () => {
    renderWithToken("bank-badge-ini", "initiative");
    expect(document.querySelector(".stackTokenBadge")?.textContent).toBe("+2 INI");
    cleanup();
    renderWithToken("bank-badge-atk", "attack");
    expect(document.querySelector(".stackTokenBadge")?.textContent).toBe("+1 ATK");
  });

  it("shows no badge on an un-stacked board", () => {
    const state = createInitialGameState("bank-badge-none");
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
    expect(document.querySelectorAll(".stackTokenBadge")).toHaveLength(0);
  });
});

describe("Retaliation status — board badge + inspect line", () => {
  function renderBoard(state: GameState) {
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
  }

  function renderInspect(state: GameState, unitId: string) {
    render(
      <CardZoomProvider>
        <InspectPanel state={state} unitId={unitId} />
      </CardZoomProvider>
    );
  }

  it("marks the active unit with a turn arrow so every seat sees whose activation it is", () => {
    const state = createInitialGameState("active-turn-arrow");
    state.combat!.activeUnitId = "unit_p1_marksmen";
    renderBoard(state);
    // Exactly one active cell and one turn arrow — not a ghost on every unit.
    expect(document.querySelectorAll(".battleCell.active")).toHaveLength(1);
    expect(document.querySelectorAll(".activeTurnArrow")).toHaveLength(1);
    const activeCell = document.querySelector(".battleCell.active");
    expect(activeCell?.querySelector(".activeTurnArrow"), "arrow sits on the active unit card").toBeTruthy();
  });

  it("shows no 'no counter' badge on a fresh board (every unit's retaliation is ready)", () => {
    const state = createInitialGameState("retaliation-ready");
    renderBoard(state);
    expect(document.querySelectorAll(".retaliationSpentBadge")).toHaveLength(0);
  });

  it("flags exactly the unit that has spent its retaliation this round", () => {
    const state = createInitialGameState("retaliation-spent");
    state.combat!.units.unit_p2_skeletons.retaliatedThisRound = true;
    renderBoard(state);
    const badges = document.querySelectorAll(".retaliationSpentBadge");
    expect(badges).toHaveLength(1);
    expect(badges[0].textContent).toMatch(/no counter/i);
  });

  it("does NOT flag a unit with unlimited retaliation even after it retaliated", () => {
    const state = createInitialGameState("retaliation-unlimited");
    const unit = state.combat!.units.unit_p2_skeletons;
    unit.retaliatedThisRound = true;
    unit.abilities = ["unlimited-retaliation"];
    renderBoard(state);
    // Unlimited retaliation never runs out, so the "spent" badge must stay off —
    // striking it still draws a counter. (This is the mutation control: without
    // the unlimited guard the unit would be flagged like any spent unit.)
    expect(document.querySelectorAll(".retaliationSpentBadge")).toHaveLength(0);
  });

  it("inspect line reads 'ready', 'spent' or 'unlimited' to match the engine reading", () => {
    const ready = createInitialGameState("retaliation-inspect-ready");
    renderInspect(ready, "unit_p2_skeletons");
    const line = document.querySelector(".inspectRetaliation")!;
    expect(line.className).toContain("ready");
    expect(line.textContent).toMatch(/ready/i);
    cleanup();

    const spent = createInitialGameState("retaliation-inspect-spent");
    spent.combat!.units.unit_p2_skeletons.retaliatedThisRound = true;
    renderInspect(spent, "unit_p2_skeletons");
    const spentLine = document.querySelector(".inspectRetaliation")!;
    expect(spentLine.className).toContain("used");
    expect(spentLine.textContent).toMatch(/spent/i);
    cleanup();

    const unlimited = createInitialGameState("retaliation-inspect-unlimited");
    const u = unlimited.combat!.units.unit_p2_skeletons;
    u.retaliatedThisRound = true;
    u.abilities = ["unlimited-retaliation"];
    renderInspect(unlimited, "unit_p2_skeletons");
    const unlimitedLine = document.querySelector(".inspectRetaliation")!;
    expect(unlimitedLine.className).toContain("unlimited");
    expect(unlimitedLine.textContent).toMatch(/unlimited/i);
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

  it("shows the opponent the trap's icon but not its armed/decoy state; the caster sees both", () => {
    const hiddenState = createInitialGameState("board-hidden-trap");
    // The trap KIND is public, so the opponent sees the same Land Mine sprite —
    // but never the armed/decoy mark (here the raw state even carries armed).
    hiddenState.combat!.battlefieldTokens = [
      { id: "t1", kind: "land_mine", position: 10, controllerId: "p2", armed: true, damage: 2 }
    ];
    renderBoard(hiddenState);
    const hidden = document.querySelector('[data-fx-cell="10"] .battlefieldToken');
    expect(hidden!.className).toContain("hiddenTrap");
    expect(hidden!.querySelector(".battlefieldTokenSprite"), "the opponent still sees the trap's icon").toBeTruthy();
    expect(spriteOnCell(10)!.style.backgroundImage).toContain("land-mine-b");
    expect(hidden!.querySelector(".trapDecoyMark"), "decoy mark must not leak to the opponent").toBeNull();
    expect(hidden!.textContent ?? "", "armed/decoy text must not leak to the opponent").not.toContain("armed");
    expect(hidden!.textContent ?? "").not.toContain("decoy");

    cleanup();

    const ownArmed = createInitialGameState("board-own-trap-armed");
    ownArmed.combat!.battlefieldTokens = [
      { id: "t1", kind: "land_mine", position: 10, controllerId: "p1", armed: true, damage: 2 }
    ];
    renderBoard(ownArmed);
    const own = document.querySelector('[data-fx-cell="10"] .battlefieldToken');
    expect(own!.className).not.toContain("hiddenTrap");
    // Armed: no tiny "armed" text and no decoy cross — the sprite alone is enough.
    expect(own!.querySelector(".trapDecoyMark")).toBeNull();
    expect(own!.textContent ?? "").not.toContain("armed");
    // A dormant mine shows the STATIC placed-mine frame (land-mine-b), never the
    // igniting/detonation animations (land-mine-a / -c). Those would loop the
    // mine sparking forever; the real blast is land-mine-hit, played only when
    // the mine is sprung (see the BATTLEFIELD_TOKEN_TRIGGERED tests in page.tsx).
    const bg = spriteOnCell(10)!.style.backgroundImage;
    expect(bg).toContain("land-mine-b");
    expect(bg).not.toContain("land-mine-a");
    expect(bg).not.toContain("land-mine-c");
    expect(bg).not.toContain("land-mine-hit");

    cleanup();

    // Empty decoy: owner sees a circle-with-cross mark (no "decoy" text).
    const ownDecoy = createInitialGameState("board-own-trap-decoy");
    ownDecoy.combat!.battlefieldTokens = [
      { id: "t1", kind: "quicksand", position: 10, controllerId: "p1", armed: false }
    ];
    renderBoard(ownDecoy);
    const decoy = document.querySelector('[data-fx-cell="10"] .battlefieldToken');
    expect(decoy!.className).toContain("decoy");
    expect(decoy!.querySelector(".trapDecoyMark"), "owner sees the empty-decoy cross").toBeTruthy();
    expect(decoy!.textContent ?? "").not.toContain("decoy");
    expect(decoy!.getAttribute("aria-label") ?? "").toMatch(/empty decoy/i);
  });

  it("never leaks an enemy trap's armed/decoy state, even when the board is fed RAW state", () => {
    // The live board receives the raw GameState (not the masked player-view), so
    // an enemy trap still carries its real `armed` flag. The opponent sees the
    // icon (the kind is public) but the armed/decoy mark must NEVER show —
    // whether the trap is armed or a decoy.
    for (const armed of [true, false]) {
      const state = createInitialGameState(`board-enemy-trap-${armed}`);
      state.combat!.battlefieldTokens = [
        { id: "t1", kind: "quicksand", position: 10, controllerId: "p2", armed }
      ];
      renderBoard(state); // viewer is p1, so p2's trap is the enemy's
      const mark = document.querySelector('[data-fx-cell="10"] .battlefieldToken');
      expect(mark!.className, "an enemy trap hides its armed state").toContain("hiddenTrap");
      expect(mark!.querySelector(".battlefieldTokenSprite"), "the icon is still shown").toBeTruthy();
      expect(mark!.querySelector(".trapDecoyMark"), "decoy mark must not leak").toBeNull();
      const text = mark!.textContent ?? "";
      expect(text).not.toContain("armed");
      expect(text).not.toContain("decoy");
      cleanup();
    }
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

  it("animates the Force Field but loops only its solid frames (no fade-out blink)", () => {
    const rafSpy = vi.spyOn(window, "requestAnimationFrame");
    const state = createInitialGameState("board-anim-force-field");
    state.combat!.battlefieldTokens = [{ id: "ff", kind: "force_field", position: 10, controllerId: "p1" }];
    rafSpy.mockClear();
    renderBoard(state);
    const sprite = spriteOnCell(10);
    expect(sprite, "the Force Field draws its sprite").toBeTruthy();
    // It shimmers (unlike the static traps)…
    expect(rafSpy, "the Force Field keeps shimmering").toHaveBeenCalled();
    // …but the loop window starts on the first SOLID frame (3 of the 15-frame
    // sheet), so it never rests on or blinks through the faded-out end frames
    // (0–2 fade in, 12–14 fade out). Removing the frameRange would drop this
    // back to frame 0 (≈ invisible), which is exactly the blink we are killing.
    expect(sprite!.style.backgroundPositionX).not.toBe("0%");
    expect(parseFloat(sprite!.style.backgroundPositionX)).toBeCloseTo((3 / 14) * 100, 1);
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

  it("neutral move destination (BINH house rule): candidate cells submit the CHOOSE_OPTION", () => {
    const state = createInitialGameState("board-neutral-dest");
    // Park every unit on the top/bottom rows so the middle cells 9 and 12 are
    // empty and can render as the guard's move-destination candidates.
    const parking = [0, 1, 2, 3, 16, 17, 18, 19];
    Object.values(state.combat!.units).forEach((unit, index) => {
      unit.position = parking[index] ?? 3;
    });
    state.combat!.obstacles = [];
    state.combat!.activeUnitId = "unit_p2_skeletons";
    state.phase = "choice";
    state.priorityPlayerId = "p1";
    state.pendingChoice = {
      id: "choice_dest",
      type: "OPTION_CHOICE",
      playerId: "p1",
      prompt: "Skeletons — choose where it moves to attack Griffins.",
      options: [{ label: "Move to B2" }, { label: "Move to C3" }],
      context: "neutral-destination",
      neutralDestination: { unitId: "unit_p2_skeletons", positions: [9, 12], defenderId: "unit_p1_griffins" },
      returnPhase: "combat"
    };
    const { onAction } = renderBoard(state);

    // The offered empty cell is a clickable MOVE destination (not "Teleport").
    const cell = document.querySelector<HTMLButtonElement>('button[data-fx-cell="12"]');
    expect(cell, "the second candidate cell renders as a button").toBeTruthy();
    expect(cell!.getAttribute("aria-label")).toMatch(/Move to/i);
    fireEvent.click(cell!);
    expect(onAction).toHaveBeenCalledWith({
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: "choice_dest",
      optionIndex: 1
    });
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

describe("InspectPanel — Attack/Defense reflect lasting buffs immediately (Bulwark Runes)", () => {
  function renderInspect(state: GameState, unitId: string) {
    return render(
      <CardZoomProvider>
        <InspectPanel state={state} unitId={unitId} />
      </CardZoomProvider>
    );
  }

  it("shows the printed base Attack/Defense when the unit has no active buff", () => {
    const state = createInitialGameState("inspect-base");
    const unit = state.combat!.units.unit_p1_marksmen;
    const { container } = renderInspect(state, unit.id);
    const stats = container.querySelector(".inspectStats")!;
    // The Attack cell shows the raw printed value with no "(base …)" annotation.
    expect(stats.textContent).toContain(`⚔ ${unit.attack}`);
    expect(stats.textContent).not.toMatch(/base/);
    expect(container.querySelector(".inspectStats .statUp")).toBeNull();
  });

  it("folds the Bulwark Rune army-wide +1 Attack / +1 Defense into the displayed stats the instant the level turns on", () => {
    const state = createInitialGameState("inspect-rune");
    state.players.p1.factionId = "bulwark";
    state.towns.town_p1.factionId = "bulwark";
    // After the house-rule swap Defense is the Level 3 bonus (Altar), Initiative is
    // Level 2 (Sieidi) — so build both and climb to the top to light up Defense.
    state.towns.town_p1.buildings.push("bulwark.sieidi", "bulwark.altar"); // cap 3
    const unit = state.combat!.units.unit_p1_marksmen;
    const baseAttack = unit.attack;
    const baseDefense = unit.defense;

    // Earn straight to Rune Level 3: +1 Attack (L1), +3 Initiative (L2) and +1
    // Defense (L3) all go live.
    gainRunes(state, "p1", RUNE_LEVEL_THRESHOLDS[2]); // 10 → Level 3

    const { container } = renderInspect(state, unit.id);
    const stats = container.querySelector(".inspectStats")!;
    // Effective Attack is base+1 with the base noted — not the unchanged printed value.
    expect(stats.textContent).toContain(`⚔ ${baseAttack + 1} (base ${baseAttack})`);
    expect(stats.textContent).toContain(`${baseDefense + 1} (base ${baseDefense})`);
    // Both raised Attack/Defense cells carry the green "up" cue (Initiative shows
    // its own cue outside the .inspectStats block).
    expect(container.querySelectorAll(".inspectStats .statUp").length).toBe(2);
  });

  it("does NOT buff an ENEMY unit's stats — the Rune effect is scoped to its owner", () => {
    const state = createInitialGameState("inspect-rune-scope");
    state.players.p1.factionId = "bulwark";
    state.towns.town_p1.factionId = "bulwark";
    gainRunes(state, "p1", RUNE_LEVEL_THRESHOLDS[0]); // p1 reaches Level 1

    // p2's unit must read its printed base — no leak across the player scope.
    const enemy = state.combat!.units.unit_p2_skeletons;
    const { container } = renderInspect(state, enemy.id);
    const stats = container.querySelector(".inspectStats")!;
    expect(stats.textContent).toContain(`⚔ ${enemy.attack}`);
    expect(stats.textContent).not.toMatch(/base/);
  });
});

  it("keeps numeric live totals in the inspector and uses coloured direction arrows on the unit card", () => {
    const state = createInitialGameState("inspect-live-totals");
    const unit = state.combat!.units.unit_p1_crusaders;
    const attackBase = unit.attack;
    const defenseBase = unit.defense;
    unit.damage = 1;
    placeCombatToken(state, unit, "attack", 2, "Bloodlust token");
    placeCombatToken(state, unit, "corrosion", 1, "Acid token");
    state.activeEffects.push(
      makeActiveEffect(
        state,
        {
          name: "Test attack buff",
          scope: "unit",
          duration: { type: "combat" },
          polarity: "positive",
          modifiers: [
            { type: "ATTACK_BONUS", amount: 1 },
            { type: "INITIATIVE_BONUS", amount: 2 }
          ]
        },
        { type: "system" },
        unit.controllerId,
        { type: "unit", unitId: unit.id }
      )
    );

    const { container } = render(
      <CardZoomProvider>
        <InspectPanel state={state} unitId={unit.id} />
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

    const stats = container.querySelector(".inspectStats")!;
    expect(stats.textContent).toContain(`${attackBase + 3} (base ${attackBase})`);
    expect(stats.textContent).toContain(`${Math.max(0, defenseBase - 1)} (base ${defenseBase})`);
    expect(container.querySelector(".inspectTotalLegend")?.textContent).toContain("LIVE TOTALS");
    const cardChanges = [...container.querySelectorAll(".boardCardStatChanges")];
    expect(cardChanges.some((changes) => changes.querySelector(".boardStatChange.attack.up"))).toBe(true);
    expect(cardChanges.some((changes) => changes.querySelector(".boardStatChange.defense.down"))).toBe(true);
    expect(cardChanges.some((changes) => changes.querySelector(".boardStatChange.health.down"))).toBe(true);
    expect(cardChanges.some((changes) => changes.querySelector(".boardStatChange.speed.up"))).toBe(true);
    expect(container.querySelector(".boardCardHud strong")).toBeNull();
    expect(container.querySelector(".boardCardHp")?.textContent).toMatch(/\d+\/\d+ HP/);
  });

  it("also puts a signed stat TOKEN rail on the card edge, outside the HUD plate", () => {
    const state = createInitialGameState("board-stat-tokens");
    const unit = state.combat!.units.unit_p1_crusaders;
    // A unit with NOTHING on it — the in-test CONTROL below.
    const plain = state.combat!.units.unit_p1_marksmen;
    placeCombatToken(state, unit, "attack", 2, "Bloodlust token");
    placeCombatToken(state, unit, "corrosion", 1, "Acid token");
    state.activeEffects.push(
      makeActiveEffect(
        state,
        {
          name: "Test speed buff",
          scope: "unit",
          duration: { type: "combat" },
          polarity: "positive",
          modifiers: [{ type: "INITIATIVE_BONUS", amount: 2 }]
        },
        { type: "system" },
        unit.controllerId,
        { type: "unit", unitId: unit.id }
      )
    );

    const { container } = render(
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

    const buffedCell = container.querySelector(`.battleCell[data-fx-unit="${unit.id}"]`)!;
    const rail = buffedCell.querySelector(".boardCardStatTokens")!;
    expect(rail, "a unit with live stat changes must wear the edge token rail").toBeTruthy();
    // The signed amounts, not just a direction: +2 Attack, -1 Defense, +2 speed.
    expect(rail.querySelector(".boardStatToken.attack.up")?.textContent).toContain("+2");
    expect(rail.querySelector(".boardStatToken.defense.down")?.textContent).toContain("-1");
    expect(rail.querySelector(".boardStatToken.speed.up")?.textContent).toContain("+2");
    // OUTSIDE the HUD plate (whose 76% width cap is a contract — see
    // board-card-hud-width.test.ts) and outside the card art, so it can never
    // cover the printed stat rail or the name plate.
    expect(buffedCell.querySelector(".boardCardHud .boardCardStatTokens")).toBeNull();
    expect(buffedCell.querySelector(".boardCardImage .boardCardStatTokens")).toBeNull();
    expect(rail.parentElement?.classList.contains("boardCard")).toBe(true);
    // CONTROL: an untouched unit on the same board wears no rail at all.
    const plainCell = container.querySelector(`.battleCell[data-fx-unit="${plain.id}"]`)!;
    expect(plainCell.querySelector(".boardCardStatTokens")).toBeNull();
  });

describe("BattlefieldBoard — siege fortification art", () => {
  function siegeState(seed = "board-siege-art"): GameState {
    const state = createInitialGameState(seed);
    const combat = state.combat!;
    const tower = makeArrowTowerUnit("siege_tower", "p2");
    combat.units[tower.id] = tower;
    // Gate in column B (9), Walls in the other three middle-row columns.
    combat.siege = {
      townPlayerId: "p2",
      walls: [8, 10, 11],
      gatePosition: 9,
      arrowTowerUnitId: tower.id
    };
    // Keep real units off the fortification row so the cells render the masonry.
    combat.units.unit_p1_marksmen.position = 0;
    combat.units.unit_p1_griffins.position = 1;
    combat.units.unit_p1_crusaders.position = 2;
    combat.units.unit_p2_skeletons.position = 16;
    combat.units.unit_p2_vampires.position = 17;
    combat.units.unit_p2_dread_knights.position = 18;
    return state;
  }

  function renderSiege(state: GameState) {
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
  }

  it("draws each Wall column with the printed Wall card scan (not bare emoji)", () => {
    renderSiege(siegeState());
    for (const wall of [8, 10, 11]) {
      const cell = document.querySelector(`[data-fx-cell="${wall}"] .fortMark.wall`);
      expect(cell, `Wall art should render on cell ${wall}`).toBeTruthy();
      const img = cell!.querySelector<HTMLImageElement>("img.fortCardImg");
      expect(img, `Wall ${wall} should draw the printed card`).toBeTruthy();
      expect(img!.getAttribute("src")).toContain("structures-wall.webp");
      expect(cell!.textContent).toContain("Wall");
      expect(cell!.textContent ?? "").not.toContain("🧱");
    }
  });

  it("draws the Gate column with the printed Gate card scan (not emoji)", () => {
    renderSiege(siegeState("board-siege-gate"));
    const gate = document.querySelector('[data-fx-cell="9"] .fortMark.gate');
    expect(gate, "Gate art should render on cell 9").toBeTruthy();
    const img = gate!.querySelector<HTMLImageElement>("img.fortCardImg");
    expect(img, "the Gate should draw the printed card").toBeTruthy();
    expect(img!.getAttribute("src")).toContain("structures-gate.webp");
    expect(gate!.textContent).toContain("Gate");
    expect(gate!.textContent ?? "").not.toContain("🚪");
  });

  it("draws the Arrow Tower card with the real printed-card scan", () => {
    renderSiege(siegeState("board-siege-tower"));
    const tower = document.querySelector(".arrowTower");
    expect(tower, "the Arrow Tower card should render beside the board").toBeTruthy();
    const cardImg = tower!.querySelector<HTMLImageElement>("img.arrowTowerCardImg");
    expect(cardImg, "the tower should render its printed card art").toBeTruthy();
    expect(cardImg!.getAttribute("src")).toContain("structures-arrow_tower.webp");
    // The live health line still rides alongside the static card (♥ current/max).
    expect(tower!.textContent ?? "").toContain("♥");
    expect(tower!.textContent ?? "").not.toContain("🏹");
  });

  // "Proper remove when destroyed": the board reads the live siege state, so a
  // felled Wall/Gate stops rendering its card and a collapsed Tower's card is
  // gone — the cell reverts to plain terrain, ready to be walked through.
  it("removes the Wall/Gate card art the moment the fortification is destroyed", () => {
    const state = siegeState("board-siege-destroyed");
    // Knock down Wall 8 and the Gate (9); Walls 10 and 11 still stand.
    state.combat!.siege = { townPlayerId: "p2", walls: [10, 11], gatePosition: null, arrowTowerUnitId: "siege_tower" };
    renderSiege(state);

    // The destroyed cells carry no fortification mark at all.
    expect(document.querySelector('[data-fx-cell="8"] .fortMark')).toBeNull();
    expect(document.querySelector('[data-fx-cell="9"] .fortMark')).toBeNull();
    expect(document.querySelector('[data-fx-cell="8"].fortification')).toBeNull();
    expect(document.querySelector('[data-fx-cell="9"].fortification')).toBeNull();
    // The surviving Walls still render their card.
    expect(
      document.querySelector('[data-fx-cell="10"] .fortMark.wall img.fortCardImg'),
      "a standing Wall keeps its card"
    ).toBeTruthy();
  });

  it("removes the Arrow Tower card once the tower has collapsed", () => {
    const state = siegeState("board-siege-tower-gone");
    // Full breach: no walls, no gate, tower removed (arrowTowerUnitId cleared).
    state.combat!.siege = { townPlayerId: "p2", walls: [], gatePosition: null, arrowTowerUnitId: null };
    renderSiege(state);
    expect(document.querySelector(".arrowTower"), "the collapsed tower's card is gone").toBeNull();
  });

  // House rule: a multi-target second attack (Hydra) / splash (Magog) that offers
  // an enemy Wall/Gate as a CHOOSE_ABILITY_TARGET renders that fortification as a
  // clickable target — reusing the exact affordance the Catapult already uses
  // (the pseudo-id path), so the wall is visible AND dispatches the pick.
  it("renders an enemy Wall offered by a second-attack choice as a clickable target", () => {
    const state = siegeState("board-siege-splash-choice");
    const onAction = vi.fn();
    const wallTarget = fortificationTargetId("wall", 8);
    const legalActions: LegalAction[] = [
      {
        label: "Hydra Assault: batter the Wall",
        action: { type: "CHOOSE_ABILITY_TARGET", playerId: "p1", choiceId: "choice_1", targetUnitId: wallTarget }
      }
    ];
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

    const wallButton = document.querySelector<HTMLButtonElement>('button.fortification.attackTarget[data-fx-cell="8"]');
    expect(wallButton, "the offered Wall renders as a clickable attack target").toBeTruthy();
    expect(wallButton!.getAttribute("aria-label")).toContain("batter the Wall");
    fireEvent.click(wallButton!);
    expect(onAction).toHaveBeenCalledWith({
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: "choice_1",
      targetUnitId: wallTarget
    });
  });
})

describe("BattlefieldBoard Polish army Stack badge", () => {
  it("keeps army Stack counts visually and semantically separate from bank tokens", () => {
    const state = createInitialGameState("army-stack-badge");
    state.combat!.units.unit_p1_griffins.armyStacks = 2;
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
    expect(document.querySelector(".armyStackBadge.combat")?.textContent).toContain("×2");
    expect(document.querySelectorAll(".stackTokenBadge")).toHaveLength(0);
  });

  it("renders the Unit Experience veteran-rank badge (carets / Elite sword / art) from the mirrored rank", () => {
    const state = createInitialGameState("unit-rank-badge");
    state.combat!.units.unit_p1_griffins.unitRank = 2;
    state.combat!.units.unit_p1_griffins.unitExperience = 6;
    state.combat!.units.unit_p2_skeletons.unitRank = 3;
    state.combat!.units.unit_p2_skeletons.unitExperience = 10;
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
    const rank2 = document.querySelector(".unitRankBadge.combat.rank-2");
    const rank3 = document.querySelector(".unitRankBadge.combat.rank-3");
    expect(rank2).toBeTruthy();
    expect(rank3).toBeTruthy();
    // Glyph fallback when badge art is absent; otherwise an <img> art chip.
    if (!rank2?.querySelector("img.unitRankBadgeArt")) {
      expect(rank2?.textContent).toBe("^^");
    }
    if (!rank3?.querySelector("img.unitRankBadgeArt")) {
      expect(rank3?.textContent).toBe("⚔");
    }
    // CONTROL: units without a mirrored rank draw no badge.
    expect(document.querySelectorAll(".unitRankBadge").length).toBe(2);
  });

  it("Neutral Rank-Up: shows the SAME veteran badge on a ranked NEUTRAL guard, with a module-off CONTROL", () => {
    const state = createInitialGameState("neutral-rank-badge");
    // A ranked neutral guard (as the Neutral Rank-Up module mints it) — the badge
    // reads the mirrored rank uniformly, so the player SEES it before engaging.
    const guard = state.combat!.units.unit_p2_skeletons;
    guard.controllerId = NEUTRAL_PLAYER_ID;
    guard.unitRank = 2;
    guard.unitExperience = 6;
    // CONTROL: another neutral unit with the module OFF carries no rank → no badge.
    const bare = state.combat!.units.unit_p1_griffins;
    bare.controllerId = NEUTRAL_PLAYER_ID;
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
    expect(document.querySelector(".unitRankBadge.combat.rank-2")).toBeTruthy();
    // Exactly ONE badge — the ranked neutral guard; the bare neutral unit has none.
    expect(document.querySelectorAll(".unitRankBadge").length).toBe(1);
  });

  it("shows the standard Stack Token badge on a Stacked bank defender (Polish size uses normal tokens)", () => {
    const state = createInitialGameState("bank-stack-badge");
    const unit = state.combat!.units.unit_p2_skeletons;
    unit.bankUnit = true;
    unit.stackToken = "attack";
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
    expect(document.querySelector(".stackTokenBadge")).not.toBeNull();
    // No bespoke Polish layer badge — the size just controls how many defenders
    // carry a normal Stack Token.
    expect(document.querySelector(".bankStackBadge")).toBeNull();
  });
});

describe("BattlefieldBoard - tied activation-order choice", () => {
  it("highlights every candidate and lets the player choose it on the board", () => {
    const state = createInitialGameState("board-activation-order-pick");
    const first = state.combat!.units.unit_p2_skeletons;
    const second = state.combat!.units.unit_p2_vampires;
    state.phase = "choice";
    state.priorityPlayerId = "p1";
    state.combat!.activeUnitId = null;
    state.pendingChoice = {
      id: "choice_activation_order",
      type: "OPTION_CHOICE",
      playerId: "p1",
      prompt: "Several Neutral units share the same speed - choose which one activates first.",
      options: [
        { label: `Activate ${first.cardName}` },
        { label: `Activate ${second.cardName}` }
      ],
      context: "combat-activation-order",
      activationOrder: { unitIds: [first.id, second.id], side: first.controllerId },
      returnPhase: "combat"
    };
    const choiceId = state.pendingChoice.id;
    const legalActions: LegalAction[] = state.pendingChoice.options.map((option, optionIndex) => ({
      label: option.label,
      action: { type: "CHOOSE_OPTION", playerId: "p1", choiceId, optionIndex }
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

    const firstCell = document.querySelector<HTMLButtonElement>(`[data-fx-unit="${first.id}"]`);
    const secondCell = document.querySelector<HTMLButtonElement>(`[data-fx-unit="${second.id}"]`);
    expect(firstCell?.classList.contains("activationOrderTarget")).toBe(true);
    expect(secondCell?.classList.contains("activationOrderTarget")).toBe(true);
    expect(firstCell?.getAttribute("aria-label")).toBe(`Choose ${first.name} to activate first`);

    fireEvent.click(secondCell!);
    expect(onAction).toHaveBeenCalledWith({
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId,
      optionIndex: 1
    });
  });

  it("does not mark tied units when the viewer has no legal choice", () => {
    const state = createInitialGameState("board-activation-order-waiting");
    const unit = state.combat!.units.unit_p2_skeletons;
    state.phase = "choice";
    state.pendingChoice = {
      id: "choice_other_player",
      type: "OPTION_CHOICE",
      playerId: "p2",
      prompt: "Choose which activates first.",
      options: [{ label: `Activate ${unit.cardName}` }],
      context: "combat-activation-order",
      activationOrder: { unitIds: [unit.id], side: unit.controllerId },
      returnPhase: "combat"
    };

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

    expect(document.querySelectorAll(".activationOrderTarget")).toHaveLength(0);
  });
});

// ===========================================================================
// Berserk on the BOARD (end to end: engine -> getLegalActions -> board render).
// The reported bug was "the berserked unit can still move freely". The board
// builds its move targets ONLY from the legal-action set, so with the REAL
// restricted actions a berserked unit offers its forced attacks and NO free
// move cell — proven here through the same getLegalActions the app calls.
// ===========================================================================

describe("BattlefieldBoard — a berserked unit cannot move freely", () => {
  function pushBerserk(state: GameState, unitId: string): void {
    const modifier: ActiveEffectModifier = { type: "BERSERK_FORCED_ATTACK" };
    state.activeEffects.push(
      makeActiveEffect(
        state,
        {
          name: "Berserk",
          scope: "unit",
          duration: { type: "next-activation" },
          polarity: "negative",
          removable: true,
          modifiers: [modifier]
        },
        { type: "system" },
        state.combat!.units[unitId].controllerId,
        { type: "unit", unitId }
      )
    );
  }

  it("offers only the forced attacks, never a free-move cell, with the real legal actions", () => {
    const state = createInitialGameState("board-berserk");
    state.combat!.obstacles = [];
    const units = state.combat!.units;
    const magma = units.unit_p2_skeletons; // the berserked unit (Magma Elemental)
    magma.unitDefId = "conflux.magma_elementals";
    magma.grade = "silver";
    magma.variant = "few";
    magma.abilities = [];
    magma.type = "ground";
    magma.position = 9;
    units.unit_p1_griffins.position = 5; // enemy, adjacent (above)
    units.unit_p2_vampires.position = 8; // ally, adjacent (left)
    units.unit_p1_marksmen.position = 0;
    units.unit_p1_crusaders.position = 3;
    units.unit_p2_dread_knights.position = 19;
    for (const id of Object.keys(units)) {
      if (id !== magma.id) units[id].abilities = [];
      units[id].maxHealth = 40;
      units[id].damage = 0;
      units[id].activatedThisRound = false;
      units[id].type = "ground";
    }
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = magma.id;
    pushBerserk(state, magma.id);

    // The REAL legal actions the app would compute for the berserked unit's owner.
    const legalActions = getLegalActions(state, "p2");
    const onAction = vi.fn();
    render(
      <CardZoomProvider>
        <BattlefieldBoard
          state={state}
          viewerPlayerId="p2"
          legalActions={legalActions}
          selectedCardAction={null}
          onAction={onAction}
          onInspect={() => {}}
        />
      </CardZoomProvider>
    );

    // The berserked unit carries a visible "Berserk" badge so the player can SEE
    // the spell landed (it is an active effect, not a token).
    const magmaCell = document.querySelector('[data-fx-cell="9"]');
    expect(magmaCell?.querySelector(".berserkBadge"), "the berserked unit shows a Berserk badge").toBeTruthy();
    expect(magmaCell?.querySelector(".berserkBadge")?.textContent).toMatch(/Berserk/i);

    // The two adjacent units are forced-attack targets (enemy AND ally).
    expect(document.querySelector('button[data-fx-cell="5"]')?.getAttribute("aria-label")).toMatch(/Attack/i);
    expect(document.querySelector('button[data-fx-cell="8"]')?.getAttribute("aria-label")).toMatch(/Attack/i);

    // A far EMPTY cell is an inert field (a <div>, not a "Move to" button): the
    // board never advertises a free move while the unit is berserked.
    for (const freeCell of [13, 12, 11, 6]) {
      const cell = document.querySelector(`[data-fx-cell="${freeCell}"]`);
      const label = cell?.getAttribute("aria-label") ?? "";
      expect(label, `cell ${freeCell} must not be a move target`).not.toMatch(/Move to/i);
      if (cell && cell.tagName === "BUTTON") {
        fireEvent.click(cell);
      }
    }
    // No MOVE_UNIT was ever dispatched — the unit truly cannot move freely.
    expect(onAction.mock.calls.some(([action]) => (action as GameAction).type === "MOVE_UNIT")).toBe(false);
  });
})

describe("BattlefieldBoard — activation status badge", () => {
  function renderBoard(state: GameState) {
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
  }

  it("marks units Ready/Acted at a glance and a Waited unit as still waiting", () => {
    const fresh = createInitialGameState("wait-badge-none");
    renderBoard(fresh);
    expect(document.querySelectorAll(".unitActivationBadge.ready").length).toBeGreaterThan(0);
    cleanup();

    const waited = createInitialGameState("wait-badge");
    waited.combat!.units.unit_p1_marksmen.waitPending = true;
    waited.combat!.units.unit_p1_marksmen.waitToken = 1;
    waited.combat!.units.unit_p1_crusaders.activatedThisRound = true;
    renderBoard(waited);
    const badges = document.querySelectorAll(".unitActivationBadge.waited");
    expect(badges).toHaveLength(1);
    expect(badges[0].textContent).toContain("Waiting");
    expect(document.querySelectorAll(".unitActivationBadge.acted").length).toBeGreaterThan(0);
  });
})

// ---------------------------------------------------------------------------
// Pack/Few side info: a Pack card tells the player what it flips to.
// ---------------------------------------------------------------------------
describe("InspectPanel — a Pack card shows the Few side it flips to", () => {
  function renderInspect(state: GameState, unitId: string) {
    return render(
      <CardZoomProvider>
        <InspectPanel state={state} unitId={unitId} />
      </CardZoomProvider>
    );
  }

  /** Rebuilds a combat unit as the PACK side of a shipped definition. */
  function asPack(state: GameState, unitId: string, unitDefId: string): void {
    const def = coreUnitDefinitions[unitDefId];
    const side = def.pack!;
    const unit = state.combat!.units[unitId];
    unit.unitDefId = unitDefId;
    unit.variant = "pack";
    unit.cardName = `Pack of ${def.name}`;
    unit.attack = side.attack;
    unit.defense = side.defense;
    unit.maxHealth = side.health;
    unit.initiative = side.initiative;
    unit.type = side.type ?? def.type;
    unit.abilities = [...(side.abilities ?? [])];
  }

  it("names the Few side and lists its stats", () => {
    const state = createInitialGameState("inspect-flip");
    asPack(state, "unit_p1_marksmen", "castle.marksmen");
    const few = coreUnitDefinitions["castle.marksmen"].few!;

    const { container } = renderInspect(state, "unit_p1_marksmen");
    const note = container.querySelector(".inspectFlipSide");
    expect(note, "the flip-side note").toBeTruthy();
    expect(note!.textContent).toContain("Flips to Few Marksmen");
    expect(note!.textContent).toContain(String(few.attack));
    expect(note!.textContent).toContain(String(few.health));
    expect(note!.textContent).toContain(`init ${few.initiative}`);
  });

  it("CONTROL: a FEW-side unit shows no flip note (nothing left to flip to)", () => {
    const state = createInitialGameState("inspect-flip-control");
    asPack(state, "unit_p1_marksmen", "castle.marksmen");
    state.combat!.units.unit_p1_marksmen.variant = "few";
    const { container } = renderInspect(state, "unit_p1_marksmen");
    expect(container.querySelector(".inspectFlipSide")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Watching a PvM (neutral) fight: the dock reports the FIGHTER's resources, not
// the watcher's own meaningless counters.
// ---------------------------------------------------------------------------
describe("CommandDock — a watcher sees the fighting player's resources", () => {
  /** A neutral fight p1 is playing out; p3 is a third seat merely watching. */
  function neutralFightState(): GameState {
    const state = createInitialGameState("dock-watcher");
    state.combat!.context = {
      kind: "neutral",
      heroId: "hero_p1",
      fieldId: "h:0:0",
      difficulty: 2,
      hasAzure: false
    };
    state.combat!.attackerPlayerId = "p1";
    state.combat!.defenderPlayerId = NEUTRAL_PLAYER_ID;
    for (const unit of Object.values(state.combat!.units)) {
      // Only p1's units and the neutral guards stand in this fight.
      unit.controllerId = unit.controllerId === "p1" ? "p1" : NEUTRAL_PLAYER_ID;
    }
    // The fighter's public state, distinct from the watcher's.
    state.players.p1.hand = ["stat.attack", "stat.defense", "stat.power"];
    state.players.p1.limits.expertUses = 2;
    state.players.p1.combatStats.expertUsesSpentThisRound = 1;
    state.players.p1.combatStats.spellsCastThisRound = 1;
    state.heroes.hero_p1.movementPoints = 4;
    // A third seat with DIFFERENT numbers: if the dock showed the viewer's own
    // state these are what would appear.
    state.players.p3 = {
      ...structuredClone(state.players.p2),
      id: "p3",
      name: "Watcher",
      hand: [],
      limits: { ...state.players.p2.limits, expertUses: 9 }
    };
    return state;
  }

  function renderDock(state: GameState, viewerPlayerId: string) {
    return render(
      <CardZoomProvider>
        <CommandDock legalActions={[]} onAction={vi.fn()} state={state} viewerPlayerId={viewerPlayerId as never} />
      </CardZoomProvider>
    );
  }

  it("names the fighter and shows THEIR level, spell count, crowns, morale and movement", () => {
    const { container } = renderDock(neutralFightState(), "p3");
    const limits = container.querySelector(".dockLimits")!;
    expect(limits.querySelector(".dockLimitsWho")?.textContent).toBe(neutralFightState().players.p1.name);
    expect(limits.textContent).toMatch(/Level\s*5/);
    expect(limits.textContent).toMatch(/Spell\s*1\/1/);
    expect(limits.textContent).toMatch(/Crowns\s*1\/2/); // fighter's, not the watcher's 9
    expect(limits.textContent).toMatch(/Morale\s*0/);
    expect(limits.textContent).toMatch(/Move\s*4/);
    expect(limits.textContent).not.toMatch(/Hand/);
  });

  it("CONTROL: the FIGHTER's own dock keeps their own numbers and no name label", () => {
    const { container } = renderDock(neutralFightState(), "p1");
    const limits = container.querySelector(".dockLimits")!;
    expect(limits.querySelector(".dockLimitsWho")).toBeNull();
    expect(limits.textContent).toMatch(/Spell\s*1\/1/);
    expect(limits.textContent).toMatch(/Crowns\s*1\/2/);
    expect(limits.textContent).toMatch(/Morale\s*0/);
    expect(limits.textContent).not.toMatch(/Hand/);
  });
});

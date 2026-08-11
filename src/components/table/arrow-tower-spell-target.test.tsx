// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BattlefieldBoard } from "./board";
import { CardZoomProvider } from "./zoom";
import { createInitialGameState, getLegalActions, makeArrowTowerUnit } from "@/engine";
import type { GameAction, GameState, LegalAction } from "@/engine";
import type { CardBoardAction } from "./utils";

afterEach(cleanup);

/**
 * THE REPORTED BUG (user ruling: "You should be able to cast aiming spells like
 * magic arrow, lightning, slow etc. on Arrow Tower").
 *
 * The ENGINE always offered the cast — `getLegalActions` returns a CAST_SPELL
 * aimed at the Tower's unit id. What was missing was any way to CLICK it: the
 * Tower stands at position -1 and therefore has no battlefield cell, and the
 * Tower card beside the board only ever rendered "Shoot the tower" / the
 * demolish button. So the player armed Magic Arrow, every cell lit up EXCEPT the
 * Tower, and the cast was unreachable.
 *
 * These cases drive the REAL board component with the REAL engine offers. jsdom
 * cannot compute CSS, so they pin the DOM/dispatch contract only — that the
 * Tower card is a button carrying the target action and fires the exact engine
 * action. The ring itself (`.arrowTower.cardTarget` in globals.css) is a
 * real-browser concern with no e2e spec.
 */

const TOWER = "siege_tower";

function siegeState(seed: string): GameState {
  const state = createInitialGameState(seed);
  const combat = state.combat!;
  combat.obstacles = [];
  const tower = makeArrowTowerUnit(TOWER, "p2");
  combat.units[tower.id] = tower;
  combat.siege = { townPlayerId: "p2", walls: [8, 10, 11], gatePosition: 9, arrowTowerUnitId: tower.id };
  combat.units.unit_p1_marksmen.position = 16;
  combat.units.unit_p1_griffins.position = 17;
  combat.units.unit_p1_crusaders.position = 19;
  combat.units.unit_p2_skeletons.position = 0;
  combat.units.unit_p2_vampires.position = 1;
  combat.units.unit_p2_dread_knights.position = 2;
  return state;
}

/** Arms p1 with `cardId` and returns the engine's own offers for the board. */
function armedBoard(seed: string, cardId: string) {
  const state = siegeState(seed);
  state.players.p1.hand = [cardId];
  state.players.p2.hand = [];
  state.combat!.activeUnitId = "unit_p1_marksmen";
  state.activePlayerId = "p1";

  const legalActions = getLegalActions(state, "p1");
  const towerCast = legalActions.find((legal) => {
    const action = legal.action as { type: string; cardId?: string; target?: { unitId?: string } };
    return action.type === "CAST_SPELL" && action.cardId === cardId && action.target?.unitId === TOWER;
  });
  return { state, legalActions, towerCast };
}

function renderBoard(
  state: GameState,
  legalActions: LegalAction[],
  selectedCardAction: CardBoardAction | null,
  onAction: (action: GameAction) => void
) {
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
}

function towerButton(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(".arrowTower .arrowTowerBody");
}

describe("Arrow Tower — an armed spell can actually be clicked onto it", () => {
  it("REPRO: an armed Magic Arrow makes the Tower card a target button that fires the engine's own cast", () => {
    const { state, legalActions, towerCast } = armedBoard("ui-arrow", "spell.magic_arrow");
    expect(towerCast, "the engine must offer the cast at the Tower for this to be a UI bug").toBeTruthy();

    const onAction = vi.fn();
    renderBoard(state, legalActions, towerCast!.action as CardBoardAction, onAction);

    const button = towerButton();
    expect(button, "the Tower card should render").toBeTruthy();
    expect(button!.getAttribute("aria-label")).toMatch(/Target Arrow Tower/i);
    expect(document.querySelector(".arrowTower.cardTarget"), "the Tower wears the cast-target ring").toBeTruthy();

    fireEvent.click(button!);
    // The EXACT engine action, not a re-derived one.
    expect(onAction).toHaveBeenCalledWith(towerCast!.action);
  });

  it("Lightning Bolt and Slow do the same (it is not one spell special-cased)", () => {
    for (const cardId of ["spell.lightning_bolt", "spell.slow"]) {
      cleanup();
      const { state, legalActions, towerCast } = armedBoard(`ui-${cardId}`, cardId);
      expect(towerCast, `${cardId} should be offered at the Tower`).toBeTruthy();
      const onAction = vi.fn();
      renderBoard(state, legalActions, towerCast!.action as CardBoardAction, onAction);
      fireEvent.click(towerButton()!);
      expect(onAction).toHaveBeenCalledWith(towerCast!.action);
    }
  });

  it("CONTROL: with NOTHING armed the Tower card inspects (it is not permanently a target)", () => {
    const { state, legalActions } = armedBoard("ui-idle", "spell.magic_arrow");
    const onAction = vi.fn();
    const onInspect = vi.fn();
    render(
      <CardZoomProvider>
        <BattlefieldBoard
          state={state}
          viewerPlayerId="p1"
          legalActions={legalActions}
          selectedCardAction={null}
          onAction={onAction}
          onInspect={onInspect}
        />
      </CardZoomProvider>
    );
    const button = towerButton()!;
    expect(button.getAttribute("title")).toMatch(/shoots without positioning penalties/i);
    expect(document.querySelector(".arrowTower.cardTarget")).toBeNull();
    fireEvent.click(button);
    expect(onInspect).toHaveBeenCalledWith(TOWER);
    expect(onAction).not.toHaveBeenCalled();
  });

  it("arming the same card at another unit still lights the Tower (the board keys on the CARD)", () => {
    const { state, legalActions } = armedBoard("ui-other", "spell.magic_arrow");
    const otherCast = legalActions.find((legal) => {
      const action = legal.action as { type: string; cardId?: string; target?: { unitId?: string } };
      return action.type === "CAST_SPELL" && action.target?.unitId === "unit_p2_skeletons";
    })!;
    const onAction = vi.fn();
    const onInspect = vi.fn();
    render(
      <CardZoomProvider>
        <BattlefieldBoard
          state={state}
          viewerPlayerId="p1"
          legalActions={legalActions}
          selectedCardAction={otherCast.action as CardBoardAction}
          onAction={onAction}
          onInspect={onInspect}
        />
      </CardZoomProvider>
    );
    // Same armed CARD, so the Tower IS a legal target of it — the board keys on
    // the card selection, not the picked unit, exactly like the cells do.
    expect(document.querySelector(".arrowTower.cardTarget")).toBeTruthy();
    // …and the ordinary unit's own cell is a target too (nothing regressed).
    const cell = document.querySelector<HTMLButtonElement>('button[data-fx-cell="0"]');
    expect(cell?.getAttribute("aria-label")).toMatch(/Target/i);
  });

  it("CONTROL: the Tower's own 'Shoot the tower' button is untouched", () => {
    // The pre-existing affordance (a ranged attacker shooting the Tower) must
    // keep working alongside the new target mode.
    const state = siegeState("ui-shoot");
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.combat!.activeUnitId = "unit_p1_marksmen";
    state.activePlayerId = "p1";
    const legalActions = getLegalActions(state, "p1");
    const shot = legalActions.find(
      (legal) => legal.action.type === "ATTACK_UNIT" && legal.action.defenderId === TOWER
    );
    expect(shot, "a ranged attacker should be able to shoot the Tower").toBeTruthy();

    const onAction = vi.fn();
    renderBoard(state, legalActions, null, onAction);
    const shootButton = [...document.querySelectorAll<HTMLButtonElement>(".arrowTower button")].find((button) =>
      /shoot the tower/i.test(button.textContent ?? "")
    );
    expect(shootButton).toBeTruthy();
    fireEvent.click(shootButton!);
    expect(onAction).toHaveBeenCalledWith(shot!.action);
  });

  it("CONTROL: a collapsed Tower renders no card at all (nothing to target)", () => {
    const state = siegeState("ui-gone");
    state.combat!.siege = { townPlayerId: "p2", walls: [], gatePosition: null, arrowTowerUnitId: null };
    state.combat!.units[TOWER].damage = state.combat!.units[TOWER].maxHealth;
    renderBoard(state, [], null, vi.fn());
    expect(document.querySelector(".arrowTower")).toBeNull();
  });
});

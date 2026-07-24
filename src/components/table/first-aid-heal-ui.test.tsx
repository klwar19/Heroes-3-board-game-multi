// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BattlefieldBoard, CommandDock } from "./board";
import { CardZoomProvider } from "./zoom";
import { createInitialGameState, type GameAction, type GameState, type LegalAction } from "@/engine";

afterEach(cleanup);

/** A sandbox combat with p1's Crusaders wounded, plus a legal Tent heal on it. */
function woundedWithHeal(): { state: GameState; heal: GameAction } {
  const state = createInitialGameState("first-aid-heal-ui");
  const crusaders = state.combat!.units.unit_p1_crusaders;
  crusaders.position = 6;
  crusaders.maxHealth = 6;
  crusaders.damage = 2;
  const heal: GameAction = {
    type: "USE_ACTIVE_EFFECT",
    playerId: "p1",
    effectId: "effect_first_aid",
    target: { type: "unit", unitId: "unit_p1_crusaders" }
  };
  return { state, heal };
}

describe("First Aid Tent heal — click the wounded unit", () => {
  it("renders a wounded friendly unit as a heal target and fires the heal on click", () => {
    const { state, heal } = woundedWithHeal();
    const onAction = vi.fn();
    const legalActions: LegalAction[] = [{ label: "First Aid Tent heal Crusaders", action: heal }];

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

    const cell = document.querySelector<HTMLButtonElement>('button[data-fx-cell="6"]');
    expect(cell, "the wounded Crusaders cell should be a clickable heal button").toBeTruthy();
    expect(cell!.getAttribute("aria-label")).toMatch(/First Aid Tent: heal/i);
    expect(cell!.className).toMatch(/healTarget/);

    fireEvent.click(cell!);
    expect(onAction).toHaveBeenCalledWith(heal);
  });

  it("does not turn the unit into a heal click while a spell target is being chosen", () => {
    const { state, heal } = woundedWithHeal();
    const legalActions: LegalAction[] = [{ label: "First Aid Tent heal Crusaders", action: heal }];
    // A selected card (targeting flow) must keep priority over the mend.
    const selectedCardAction = {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p2_skeletons" }
    } as unknown as Parameters<typeof BattlefieldBoard>[0]["selectedCardAction"];

    render(
      <CardZoomProvider>
        <BattlefieldBoard
          state={state}
          viewerPlayerId="p1"
          legalActions={legalActions}
          selectedCardAction={selectedCardAction}
          onAction={vi.fn()}
          onInspect={() => {}}
        />
      </CardZoomProvider>
    );

    const cell = document.querySelector<HTMLButtonElement>('button[data-fx-cell="6"]');
    // It falls back to an inspect button, not a heal button.
    expect(cell?.getAttribute("aria-label") ?? "").not.toMatch(/heal/i);
  });
});

describe("First Aid Tent heal — button by the commands", () => {
  it("shows a heal command button and dispatches the heal when clicked", () => {
    const { state, heal } = woundedWithHeal();
    const onAction = vi.fn();
    const legalActions: LegalAction[] = [{ label: "First Aid Tent heal Crusaders", action: heal }];

    render(
      <CommandDock
        state={state}
        viewerPlayerId="p1"
        legalActions={legalActions}
        onAction={onAction}
      />
    );

    const button = screen.getByRole("button", { name: /First Aid Tent heal Crusaders/i });
    fireEvent.click(button);
    expect(onAction).toHaveBeenCalledWith(heal);
  });
});

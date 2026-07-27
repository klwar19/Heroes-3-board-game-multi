// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HeroActionsDock } from "./hero-actions-dock";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  getMainHero,
  DEFAULT_ANIME_OPTIONS,
  type GameAction,
  type GameState,
  type LegalAction
} from "@/engine";

afterEach(cleanup);

const GRADES_ON = { ...DEFAULT_ANIME_OPTIONS, enabled: true, heroGrades: true };

/** A p1 map turn with the Hero Grades module on and enough MP to Train. */
function heroTrainTurn(anime = GRADES_ON): GameState {
  let state = createAdventureGameState({
    seed: "hero-actions-dock",
    difficulty: "normal",
    rollFirstPlayer: false,
    anime
  });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyAction(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] }).state;
  }
  const hero = getMainHero(state, "p1")!;
  hero.spaceId = "start";
  hero.movementPoints = 5;
  return state;
}

/** Synthetic legal action entry (the dock reads .action; label is cosmetic). */
function legal(action: GameAction): LegalAction {
  return { action, label: "x" };
}

describe("HeroActionsDock", () => {
  it("shows the Train button when the engine offers HERO_TRAIN, and dispatches the exact payload", () => {
    const state = heroTrainTurn();
    const legalActions = getLegalActions(state, "p1");
    // Sanity: the engine really offers HERO_TRAIN in this fixture.
    expect(legalActions.some((entry) => entry.action.type === "HERO_TRAIN")).toBe(true);

    const onAction = vi.fn();
    render(<HeroActionsDock legalActions={legalActions} onAction={onAction} />);

    const button = screen.getByRole("button", { name: /Train/ });
    fireEvent.click(button);
    expect(onAction).toHaveBeenCalledWith({ type: "HERO_TRAIN", playerId: "p1" });
  });

  it("renders NOTHING when the module is off — no HERO_TRAIN offer (CONTROL)", () => {
    const state = heroTrainTurn(DEFAULT_ANIME_OPTIONS); // heroGrades off
    const legalActions = getLegalActions(state, "p1");
    expect(legalActions.some((entry) => entry.action.type === "HERO_TRAIN")).toBe(false);

    const { container } = render(<HeroActionsDock legalActions={legalActions} onAction={vi.fn()} />);
    expect(container.querySelector(".heroActionsDock")).toBeNull();
  });

  it("renders NOTHING when the action list is empty (not your turn ⇒ no offers, CONTROL)", () => {
    const { container } = render(<HeroActionsDock legalActions={[]} onAction={vi.fn()} />);
    expect(container.querySelector(".heroActionsDock")).toBeNull();
  });

  it("renders one bilingual button per offered hero action and dispatches each exact payload", () => {
    const onAction = vi.fn();
    const legalActions: LegalAction[] = [
      legal({ type: "HERO_TRAIN", playerId: "p1" }),
      legal({ type: "USE_HERO_SKILL", playerId: "p1", nodeId: "forced-march" }),
      legal({ type: "HEAVEN_TRIBULATION", playerId: "p1" })
    ];
    render(<HeroActionsDock legalActions={legalActions} onAction={onAction} />);

    // Three buttons, each carrying its EN + VI label.
    expect(screen.getByText("Train")).toBeTruthy();
    expect(screen.getByText("Luyện tập")).toBeTruthy();
    expect(screen.getByText("Forced March")).toBeTruthy();
    expect(screen.getByText("Cưỡng hành")).toBeTruthy();
    expect(screen.getByText("Heavenly Tribulation")).toBeTruthy();
    expect(screen.getByText("Độ kiếp")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Forced March/ }));
    expect(onAction).toHaveBeenCalledWith({ type: "USE_HERO_SKILL", playerId: "p1", nodeId: "forced-march" });

    fireEvent.click(screen.getByRole("button", { name: /Heavenly Tribulation/ }));
    expect(onAction).toHaveBeenCalledWith({ type: "HEAVEN_TRIBULATION", playerId: "p1" });

    fireEvent.click(screen.getByRole("button", { name: /Train/ }));
    expect(onAction).toHaveBeenCalledWith({ type: "HERO_TRAIN", playerId: "p1" });
  });

  it("surfaces Revisit when a Hero begins the turn on a Monolith", () => {
    const state = heroTrainTurn();
    state.adventure!.fields.start = {
      spaceId: "start",
      tileInstanceId: "test",
      slot: 0,
      location: "monolith",
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };
    const legalActions = getLegalActions(state, "p1");
    const revisit = legalActions.find((entry) => entry.action.type === "REVISIT_FIELD");
    expect(revisit).toBeTruthy();

    const onAction = vi.fn();
    render(<HeroActionsDock legalActions={legalActions} onAction={onAction} />);

    fireEvent.click(screen.getByRole("button", { name: /Revisit.*Monolith/i }));
    expect(onAction).toHaveBeenCalledWith(revisit!.action);
  });

  it("ignores a non-Forced-March USE_HERO_SKILL (e.g. combat War Cry)", () => {
    // Only the map-active Forced March node surfaces here; the combat War Cry /
    // reactions (other nodeIds, carrying a unitId) must not render a map button.
    const legalActions: LegalAction[] = [
      legal({ type: "USE_HERO_SKILL", playerId: "p1", nodeId: "war-cry", unitId: "u1" })
    ];
    const { container } = render(<HeroActionsDock legalActions={legalActions} onAction={vi.fn()} />);
    expect(container.querySelector(".heroActionsDock")).toBeNull();
  });
});

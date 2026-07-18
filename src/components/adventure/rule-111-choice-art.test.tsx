// @vitest-environment jsdom
/**
 * Polish Rule 111 (home-tile bronze swap): a purpose-built two-column tray —
 * the "Use Rule 111: replace the Guard" swap on the LEFT, and the drawn guard's
 * card face with an "Accept the guard" button on the RIGHT. Picking the either/or
 * by the guard art (accept the unit you see) or the swap is far more intuitive
 * than a flat row of same-looking buttons.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PromptTray } from "./screen";
import { createAdventureGameState, getLegalActions, hexSpaceId, type GameState } from "@/engine";
import { startNeutralEncounter } from "@/engine/adventure-reducer";
import { getMainHero } from "@/engine/adventure";
import { applyAction } from "@/engine/reducer";
import { coreUnitDefinitions } from "@/data/factions/units";

afterEach(cleanup);

/** A real difficulty-I neutral fight on p1's OWN home tile → the Rule 111 choice. */
function rule111State(seed: string): GameState {
  let state = createAdventureGameState({
    seed,
    difficulty: "easy",
    rollFirstPlayer: false,
    houseRules: { "polish-rule-111": true }
  });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyAction(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] }).state;
  }
  const adventure = state.adventure!;
  const hero = getMainHero(state, "p1")!;
  hero.level = 1; // even fight opens (level > difficulty would Quick-Combat resolve)
  const homeTile = Object.values(adventure.tiles).find(
    (tile) =>
      tile.group === "starting" &&
      adventure.fields[hexSpaceId({ row: tile.centerRow, col: tile.centerCol })]?.flagOwnerId === "p1"
  )!;
  const fieldId = "rule111-guard";
  adventure.fields[fieldId] = {
    spaceId: fieldId,
    tileInstanceId: homeTile.id,
    slot: 0,
    location: "empty",
    difficulty: 1,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  hero.spaceId = fieldId;
  startNeutralEncounter(state, hero, adventure.fields[fieldId]!);
  for (let i = 0; i < 30 && state.combat?.setup; i += 1) {
    const actions = getLegalActions(state, "p1");
    const next =
      actions.find((l) => l.action.type === "PLACE_COMBAT_UNIT") ??
      actions.find((l) => l.action.type === "FINISH_COMBAT_PLACEMENT");
    if (!next) break;
    state = applyAction(state, next.action).state;
  }
  return state;
}

describe("Rule 111 choice tray — replace on the left, accept the guard on the right", () => {
  it("shows the guard art on the Accept side and wires both buttons", () => {
    const state = rule111State("rule111-art");
    const choice = state.pendingChoice;
    expect(choice?.type === "OPTION_CHOICE" && choice.context === "rule-111").toBe(true);
    if (choice?.type !== "OPTION_CHOICE") return;

    // The bronze guards on the block, in the same order the choice offers them.
    const bronzeDraws = (state.combat!.pendingNeutralDraws ?? []).filter(
      (draw) => draw.tier === "bronze" && !draw.bankGuard
    );
    expect(bronzeDraws.length).toBeGreaterThan(0);
    const firstDef = coreUnitDefinitions[bronzeDraws[0]!.unitDefId];
    const firstImage = firstDef?.neutral?.cardImage ?? firstDef?.few?.cardImage ?? firstDef?.pack?.cardImage;
    expect(firstImage, "the bronze guard has card art").toBeTruthy();

    const onAction = vi.fn();
    const { container } = render(
      <PromptTray legalActions={getLegalActions(state, "p1")} onAction={onAction} state={state} viewerPlayerId="p1" />
    );

    // The drawn guard's card face is shown on the Accept side (not on the swap button).
    const guardImg = container.querySelector(".rule111Accept img.rule111GuardImage");
    expect(guardImg?.getAttribute("src")).toContain(firstImage!);

    // The swap button carries the intuitive Rule-111 wording and NO card art.
    const replace = screen.getByRole("button", { name: /replace the Guard/i });
    expect(replace.querySelector("img")).toBeNull();

    // Clicking the swap dispatches the option resolve (optionIndex 1).
    fireEvent.click(replace);
    expect(onAction).toHaveBeenCalledWith({
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: 1
    });

    // "Accept the guard" keeps the drawn army (optionIndex 0).
    const accept = screen.getByRole("button", { name: /Accept the guard/i });
    fireEvent.click(accept);
    expect(onAction).toHaveBeenCalledWith({
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: 0
    });
  });
});

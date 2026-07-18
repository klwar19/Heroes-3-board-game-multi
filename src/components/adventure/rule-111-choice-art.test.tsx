// @vitest-environment jsdom
/**
 * Polish Rule 111 (home-tile bronze swap): the "Replace <unit>" options must
 * SHOW the neutral unit's card face in the prompt tray — picking a swap by art
 * is far more intuitive than by name alone. The "Keep the drawn army" option
 * stays a plain button (it names no unit).
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

describe("Rule 111 choice tray — shows the neutral unit's card face", () => {
  it("renders the replace options as unit-art tiles (Keep stays a plain button)", () => {
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
    render(
      <PromptTray legalActions={getLegalActions(state, "p1")} onAction={onAction} state={state} viewerPlayerId="p1" />
    );

    // The first "Replace <unit>" option shows that unit's card image.
    const replace = screen.getByRole("button", { name: /Replace/i });
    expect(replace.querySelector("img")?.getAttribute("src")).toContain(firstImage!);

    // "Keep the drawn army" carries no unit, so it stays a plain (imageless) button.
    const keep = screen.getByRole("button", { name: /Keep the drawn army/i });
    expect(keep.querySelector("img")).toBeNull();

    // Clicking the replace tile dispatches the option resolve (optionIndex 1).
    fireEvent.click(replace);
    expect(onAction).toHaveBeenCalledWith({
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: 1
    });
  });
});

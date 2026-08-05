// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { PromptTray } from "./screen";
import { createAdventureGameState, getLegalActions, type GameState } from "@/engine";
import { getMainHero, instantiateTile } from "@/engine/adventure";

afterEach(cleanup);

function clueState(selected = false): GameState {
  const state = createAdventureGameState({ seed: "obelisk-grail-clue-art", difficulty: "normal", rollFirstPlayer: false });
  const tile = instantiateTile(state.adventure!, "C4", { row: 90, col: 90 }, 0, true);
  const hero = getMainHero(state, "p1")!;
  state.adventure!.pendingVisit = {
    heroId: hero.id,
    playerId: "p1",
    fieldId: hero.spaceId!,
    steps: [
      selected
        ? {
            type: "CHOOSE_ONE",
            prompt: "Grail clue — memorize this tile, then hide it again.",
            options: [{ label: "Hide tile again", steps: [] }],
            grailTileScry: { tileInstanceId: tile.id }
          }
        : {
            type: "CHOOSE_ONE",
            prompt: "Obelisk — choose one face-down tile to inspect for a Grail clue",
            options: [
              { label: "Tile at row 90, col 90", steps: [{ type: "GRAIL_TILE_SCRY", tileInstanceId: tile.id }] },
              { label: "Do not inspect a tile", steps: [] }
            ]
          }
    ]
  };
  return state;
}

describe("Obelisk Grail clue art", () => {
  it("does not preview any tile face in the initial position picker", () => {
    const state = clueState();
    const { container } = render(
      <PromptTray legalActions={getLegalActions(state, "p1")} onAction={vi.fn()} state={state} viewerPlayerId="p1" />
    );

    expect(container.querySelectorAll(".tileThumb")).toHaveLength(0);
  });

  it("shows only the selected tile's face in the private hide-again prompt", () => {
    const state = clueState(true);
    const { container } = render(
      <PromptTray legalActions={getLegalActions(state, "p1")} onAction={vi.fn()} state={state} viewerPlayerId="p1" />
    );

    expect(container.querySelectorAll(".tileThumb")).toHaveLength(1);
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { PromptTray } from "./screen";
import { createAdventureGameState, getLegalActions, type GameState } from "@/engine";
import { getMainHero, instantiateTile } from "@/engine/adventure";
import { getPlayerView } from "@/engine/player-view";

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
            // The engine bakes the revealed identity into the step because the
            // owner's PLAYER VIEW masks every face-down tile to "hidden".
            grailTileScry: { tileInstanceId: tile.id, tileDefId: tile.tileDefId, tileRotation: tile.rotation }
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
    // The live client renders exactly this shape: a redacted player view
    // deserialized into the GameState-typed prop.
    const view = getPlayerView(state, "p1") as unknown as GameState;
    const { container } = render(
      <PromptTray legalActions={getLegalActions(state, "p1")} onAction={vi.fn()} state={view} viewerPlayerId="p1" />
    );

    expect(container.querySelectorAll(".tileThumb")).toHaveLength(0);
  });

  it("shows the selected tile's REAL face through the owner's masked player view", () => {
    // The client always renders a PLAYER VIEW, in which every face-down tile is
    // masked to tileDefId "hidden" — so the art MUST come from the step's own
    // grailTileScry payload, never from state.adventure.tiles. Rendering the
    // raw state here would pass even when the real table shows a broken face.
    const state = clueState(true);
    const view = getPlayerView(state, "p1") as unknown as GameState;
    const { container } = render(
      <PromptTray legalActions={getLegalActions(state, "p1")} onAction={vi.fn()} state={view} viewerPlayerId="p1" />
    );

    const thumbs = container.querySelectorAll(".tileThumb");
    expect(thumbs).toHaveLength(1);
    const img = container.querySelector(".tileThumb img") as HTMLImageElement | null;
    expect(img?.src ?? "").toContain("c4");
  });

  it("renders NOTHING of the clue for another seat's view", () => {
    const state = clueState(true);
    const view = getPlayerView(state, "p2") as unknown as GameState;
    const { container } = render(
      <PromptTray legalActions={getLegalActions(state, "p2")} onAction={vi.fn()} state={view} viewerPlayerId="p2" />
    );

    expect(container.querySelectorAll(".tileThumb")).toHaveLength(0);
    expect(container.textContent ?? "").not.toContain("C4");
  });
});

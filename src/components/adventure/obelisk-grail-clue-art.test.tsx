// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HexMapBoard, PromptTray } from "./screen";
import { createAdventureGameState, getLegalActions, type GameAction, type GameState } from "@/engine";
import { beginFieldVisit, getMainHero, instantiateTile } from "@/engine/adventure";
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

/**
 * USER REQUEST (2026-08-10): "choose tiles from map view (much more intuitive)".
 * The picker's per-tile buttons are replaced by clicking the glowing face-down
 * tile itself; the engine's option list stays index-aligned and labelled (the
 * AFK driver / AI scorer / screen readers read it), and the decline option stays
 * reachable in the tray.
 */
describe("Obelisk Grail clue — map picking", () => {
  /** Turns the hero's own field into an Obelisk and opens the real clue picker. */
  function realCluePicker(): { state: GameState; grailTileId: string; utopiaTileId: string } {
    const state = createAdventureGameState({
      seed: "obelisk-grail-clue-map",
      difficulty: "normal",
      rollFirstPlayer: false
    });
    state.players.p1.canMulligan = false;
    state.players.p1.needsHandRefresh = false;
    state.adventure!.mapPreset = { obelisks: { role: "victory-only" } };
    const grail = instantiateTile(state.adventure!, "C4", { row: 70, col: 70 }, 0, true);
    const utopia = instantiateTile(state.adventure!, "C1", { row: 74, col: 74 }, 0, true);
    const hero = getMainHero(state, "p1")!;
    const field = state.adventure!.fields[hero.spaceId!];
    field.location = "obelisk";
    field.flagOwnerId = null;
    field.everFlagged = false;
    field.blackCube = false;
    beginFieldVisit(state, hero.id, field.spaceId, false);
    const step = state.adventure!.pendingVisit?.steps[0];
    if (step?.type !== "CHOOSE_ONE") {
      throw new Error("expected the Obelisk Grail clue picker");
    }
    return { state, grailTileId: grail.id, utopiaTileId: utopia.id };
  }

  it("glows every offered tile on the map and dispatches its option on click", () => {
    const { state, grailTileId, utopiaTileId } = realCluePicker();
    const step = state.adventure!.pendingVisit!.steps[0];
    if (step.type !== "CHOOSE_ONE") throw new Error("expected the picker");
    const utopiaOptionIndex = step.options.findIndex(
      (option) => option.steps[0]?.type === "GRAIL_TILE_SCRY" && option.steps[0].tileInstanceId === utopiaTileId
    );
    expect(utopiaOptionIndex).toBeGreaterThanOrEqual(0);
    const legalActions = getLegalActions(state, "p1");
    const expected = legalActions.find(
      (legal) => legal.action.type === "RESOLVE_VISIT_STEP" && legal.action.optionIndex === utopiaOptionIndex
    )?.action;
    expect(expected).toBeTruthy();

    const onAction = vi.fn<(action: GameAction) => void>();
    const { container } = render(
      <HexMapBoard
        legalActions={legalActions}
        moveCue={null}
        onAction={onAction}
        placement={null}
        state={state}
        view={getPlayerView(state, "p1")}
        viewerPlayerId="p1"
      />
    );

    // Both Ⅶ hosts glow…
    expect(
      container.querySelector<SVGPolygonElement>(`[data-tile-id="${grailTileId}"]`)?.classList.contains(
        "grailClueTarget"
      )
    ).toBe(true);
    const target = container.querySelector<SVGPolygonElement>(`[data-tile-id="${utopiaTileId}"]`);
    expect(target).toBeTruthy();
    expect(target!.classList.contains("grailClueTarget")).toBe(true);
    // …and clicking one dispatches that tile's OWN engine option.
    fireEvent.click(target!);
    expect(onAction).toHaveBeenCalledWith(expected);
  });

  it("CONTROL: with no clue open no face-down tile is a clue target", () => {
    const state = createAdventureGameState({
      seed: "obelisk-grail-clue-map-control",
      difficulty: "normal",
      rollFirstPlayer: false
    });
    state.players.p1.canMulligan = false;
    state.players.p1.needsHandRefresh = false;
    instantiateTile(state.adventure!, "C4", { row: 70, col: 70 }, 0, true);
    const { container } = render(
      <HexMapBoard
        legalActions={getLegalActions(state, "p1")}
        moveCue={null}
        onAction={vi.fn()}
        placement={null}
        state={state}
        view={getPlayerView(state, "p1")}
        viewerPlayerId="p1"
      />
    );

    expect(container.querySelectorAll(".grailClueTarget")).toHaveLength(0);
  });

  it("shows only the hint plus the decline button — never one button per tile", () => {
    const { state } = realCluePicker();
    const step = state.adventure!.pendingVisit!.steps[0];
    if (step.type !== "CHOOSE_ONE") throw new Error("expected the picker");
    const declineIndex = step.options.length - 1;
    expect(step.options[declineIndex]?.label).toBe("Do not inspect a tile");
    // The picker really does hold several tile options — so a generic render
    // WOULD produce the wall of buttons this replaces.
    expect(declineIndex).toBeGreaterThan(1);

    const onAction = vi.fn<(action: GameAction) => void>();
    render(
      <PromptTray
        legalActions={getLegalActions(state, "p1")}
        onAction={onAction}
        state={getPlayerView(state, "p1") as unknown as GameState}
        viewerPlayerId="p1"
      />
    );

    const labels = screen.getAllByRole("button").map((button) => button.textContent ?? "");
    // CONTROL: rendering the engine's option list again would bring these back.
    expect(labels.some((label) => /Tile at row/i.test(label))).toBe(false);
    expect(labels).toEqual(["Do not inspect a tile"]);
    expect(screen.getByText(/click one of the .* glowing face-down tiles/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Do not inspect a tile" }));
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "RESOLVE_VISIT_STEP", optionIndex: declineIndex })
    );
  });

  // CONTROL for the picker branch's detection: the FOLLOW-UP reveal step is also
  // a CHOOSE_ONE, but carries no GRAIL_TILE_SCRY option — it must keep its
  // ordinary tile-art tray, or the player would never see the clue.
  it("CONTROL: the private reveal step keeps its ordinary tile-art tray", () => {
    const state = clueState(true);
    const view = getPlayerView(state, "p1") as unknown as GameState;
    const { container } = render(
      <PromptTray legalActions={getLegalActions(state, "p1")} onAction={vi.fn()} state={view} viewerPlayerId="p1" />
    );

    expect(container.querySelectorAll(".tileThumb")).toHaveLength(1);
    expect(container.textContent ?? "").not.toMatch(/glowing face-down tiles/i);
  });
});

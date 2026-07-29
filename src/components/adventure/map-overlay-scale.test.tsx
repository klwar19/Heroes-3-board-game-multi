// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { HexMapBoard } from "./screen";
import { instantiateTile } from "@/engine/adventure";
import {
  createAdventureGameState,
  getLegalActions,
  getPlayerView,
  getTileFootprintSpaceIds,
  type GameState
} from "@/engine";

afterEach(cleanup);

function adventureOf(state: GameState) {
  if (!state.adventure) {
    throw new Error("no adventure state");
  }
  return state.adventure;
}

function renderBoard(state: GameState): HTMLElement {
  return render(
    <HexMapBoard
      legalActions={getLegalActions(state, "p1")}
      moveCue={null}
      onAction={() => {}}
      placement={null}
      state={state}
      view={getPlayerView(state, "p1")}
      viewerPlayerId="p1"
    />
  ).container;
}

describe("compact map overlays", () => {
  it("keeps Heavenly Demon Palace starting-tile bonus icons well inside their hex art", () => {
    const state = createAdventureGameState({
      seed: "heavenly-demon-overlay-scale",
      rollFirstPlayer: false
    });
    instantiateTile(adventureOf(state), "D-S1", { row: 24, col: 12 }, 0, false);

    const container = renderBoard(state);
    const icons = [...container.querySelectorAll("image.fieldSymbolModule[data-symbol-kind]")];
    expect(icons).toHaveLength(3);
    expect(icons.map((icon) => icon.getAttribute("data-symbol-kind")).sort()).toEqual([
      "mine",
      "resource",
      "treasure"
    ]);
    for (const icon of icons) {
      // Live-map HEX_SIZE is 34; the largest module is now 34 * 0.62 = 21.08,
      // instead of the previous nearly-full-hex 32.3 px resource icon.
      expect(Number(icon.getAttribute("width"))).toBeLessThanOrEqual(21.1);
      expect(Number(icon.getAttribute("height"))).toBeLessThanOrEqual(21.1);
    }
  });

  it("renders the dungeon progress label as a compact badge rather than a full-width object caption", () => {
    const state = createAdventureGameState({
      seed: "dungeon-overlay-scale",
      rollFirstPlayer: false
    });
    const tile = instantiateTile(adventureOf(state), "F3", { row: 24, col: 12 }, 0, false);
    const dungeonSpace = getTileFootprintSpaceIds(tile)[1];
    const field = adventureOf(state).fields[dungeonSpace]!;
    field.location = "dungeon_gate";
    delete field.difficulty;
    state.players.p1.dungeonFloor = 1;

    const badge = renderBoard(state).querySelector(".dungeonFloorSvgBadge");
    expect(badge?.getAttribute("aria-label")).toBe("Your dungeon progress: floor 1");
    expect(badge?.querySelector("rect")?.getAttribute("width")).toBe("42");
    expect(badge?.querySelector("rect")?.getAttribute("height")).toBe("13");
    const label = badge?.querySelector("text");
    expect(label?.textContent).toBe("FLOOR 1");
    expect(label?.getAttribute("font-size")).toBe("6");
  });
});

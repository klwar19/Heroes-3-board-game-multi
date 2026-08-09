// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { HexMapBoard } from "./screen";
import { instantiateTile } from "@/engine/adventure";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  getPlayerView,
  getTileFootprintSpaceIds,
  type GameState
} from "@/engine";
import { allTileDefinitions } from "@/data/map/tiles";

afterEach(cleanup);

/**
 * The Calamity Gate / Dungeon Gate are carved ONTO a printed Blocked Field, whose
 * slot also carries the tile's sealed outer arc. The board must stop drawing that
 * hex's ring once it is a Gate, or the site reads as impassable — the reported
 * "borders all around it, can't access". Creature Banks follow the same
 * permanent no-border presentation.
 */
const TILE = "F3"; // far tile: blocked field on slot 3, sealed outer arc
const SLOT = 3;

function boardWithLocationOnBlockedSlot(
  location: string,
  seed: string,
  addDesignedTouchingEdge = false,
): HTMLElement {
  let state: GameState = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  state.activePlayerId = "p1";
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyAction(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] }).state;
  }
  const tile = instantiateTile(state.adventure!, TILE, { row: 28, col: 14 }, 0, false);
  if (addDesignedTouchingEdge) {
    // Slot 2's SW edge is the shared physical edge with carved slot 3. Encoding
    // it from the neighbouring hex catches suppression that only checks owner.
    tile.borderEdges = [2 * 6 + 3];
  }
  const spaceId = getTileFootprintSpaceIds(tile)[SLOT];
  const field = state.adventure!.fields[spaceId]!;
  expect(field.location, "the fixture slot is the printed Blocked Field").toBe("blocked_field");
  field.location = location;
  const { container } = render(
    <HexMapBoard
      legalActions={getLegalActions(state, "p1")}
      moveCue={null}
      onAction={() => {}}
      placement={null}
      state={state}
      view={getPlayerView(state, "p1")}
      viewerPlayerId="p1"
    />
  );
  return container;
}

describe("a Gate carved over a Blocked Field draws no printed border on the board", () => {
  it("the fixture tile really prints a sealed blocked slot", () => {
    const def = allTileDefinitions[TILE];
    expect(def.fields[SLOT].location).toBe("blocked_field");
    expect(def.outerImpassable[SLOT - 1]).toBe(true);
  });

  for (const location of ["creature_bank", "dungeon_gate", "calamity_gate"] as const) {
    it(`${location}: the hex is border-free while a plain Blocked Field is ringed`, () => {
      const carved = boardWithLocationOnBlockedSlot(location, `gate-board-${location}`);
      const printed = boardWithLocationOnBlockedSlot("blocked_field", `gate-board-control-${location}`);

      // The whole tile loses exactly this slot's lines: compare totals, since the
      // rendered lines carry no per-slot attribute.
      const carvedLines = carved.querySelectorAll("line.tileBorderLine").length;
      const printedLines = printed.querySelectorAll("line.tileBorderLine").length;
      expect(printedLines, "a plain Blocked Field is ringed").toBeGreaterThan(carvedLines);
      expect(carvedLines, "the Gate's ring and arc are gone").toBe(printedLines - 6);
    });

    it(`${location}: designer borders touching the carved hex are removed too`, () => {
      const baseline = boardWithLocationOnBlockedSlot(location, `gate-designed-base-${location}`);
      const designed = boardWithLocationOnBlockedSlot(location, `gate-designed-edge-${location}`, true);
      expect(designed.querySelectorAll("line.tileBorderLine").length).toBe(
        baseline.querySelectorAll("line.tileBorderLine").length,
      );
    });
  }
});

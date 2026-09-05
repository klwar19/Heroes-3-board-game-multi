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
 * "borders all around it, can't access". Creature Banks are different under
 * BINH rules: their inward seams stay open, while only the three outward edges
 * remain drawn to communicate that the bank cannot be entered from (or exited
 * toward) the surrounding map.
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

describe("a Gate carved over a Blocked Field draws only the printed OUTER arc on the board", () => {
  it("the fixture tile really prints a sealed blocked slot", () => {
    const def = allTileDefinitions[TILE];
    expect(def.fields[SLOT].location).toBe("blocked_field");
    expect(def.outerImpassable[SLOT - 1]).toBe(true);
  });

  for (const location of ["creature_bank", "dungeon_gate", "calamity_gate"] as const) {
    // FLIPPED 2026-09-05 (USER RULE "Only remove the INSIDE border to get in"):
    // the two PvE Gates used to lose all six of the slot's lines. All three
    // carves now behave alike — the three INSIDE edges open, the printed OUTER
    // arc stays drawn — which is also what movement enforces.
    it(`${location}: the hex opens its INSIDE ring and keeps the printed outer arc`, () => {
      const carved = boardWithLocationOnBlockedSlot(location, `gate-board-${location}`);
      const printed = boardWithLocationOnBlockedSlot("blocked_field", `gate-board-control-${location}`);

      // The whole tile loses exactly this slot's inside lines: compare totals,
      // since the rendered lines carry no per-slot attribute.
      const carvedLines = carved.querySelectorAll("line.tileBorderLine").length;
      const printedLines = printed.querySelectorAll("line.tileBorderLine").length;
      expect(printedLines, "a plain Blocked Field is ringed").toBeGreaterThan(carvedLines);
      expect(
        carvedLines,
        "the carve keeps only its outward containment arc",
      ).toBe(printedLines - 3);
    });

    // USER RULE 2026-08-22 (supersedes the v24 "designer edges are inert at a
    // border-free hex" reading): the carve removes the tile's own PRINTED lines
    // (the test above) but never a FIXED yellow border the designer drew — it is
    // still painted here and still seals movement
    // (`designed-borders.test.ts` > "a FIXED yellow border is respected …").
    it(`${location}: a designer border touching the carved hex is STILL drawn`, () => {
      const baseline = boardWithLocationOnBlockedSlot(location, `gate-designed-base-${location}`);
      const designed = boardWithLocationOnBlockedSlot(location, `gate-designed-edge-${location}`, true);
      const baseCount = baseline.querySelectorAll("line.tileBorderLine").length;
      // CONTROL is the baseline board: same fixture, same carve, no designer edge.
      expect(designed.querySelectorAll("line.tileBorderLine").length).toBeGreaterThan(baseCount);
    });
  }
});

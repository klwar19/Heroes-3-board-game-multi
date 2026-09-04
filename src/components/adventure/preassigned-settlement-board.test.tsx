// @vitest-environment jsdom
/**
 * A designer PRE-ASSIGNED settlement (`settlement.ownerStart`) is flagged to
 * its owner the moment the tile is revealed, so the MAP must draw it like any
 * captured / founded settlement: the owner's flag on that hex, in the owner's
 * colour, from turn 1.
 *
 * jsdom cannot compute CSS, so this pins the DOM contract (the flag marker on
 * the settlement's own hex, carrying the owner) and NOT a pixel; the engine
 * half lives in `src/engine/preassigned-settlement.test.ts`.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { HexMapBoard } from "./screen";
import {
  createAdventureGameState,
  getLegalActions,
  getPlayerView,
  getTileFootprintSpaceIds,
  type CustomMapTilePlan,
  type GameState,
  type MapFieldState
} from "@/engine";
import { scenarioDefinitions } from "@/data/map/scenarios";

afterEach(cleanup);

const starts = scenarioDefinitions.skirmish.layout.starts;

function board(state: GameState) {
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
  );
}

/** Two designer Towns plus a revealed Ⅱ–Ⅲ settlement slot owned by S`owner+1`. */
function tiles(owner?: number): CustomMapTilePlan[] {
  return [
    { ...starts[0], group: "starting", faceDown: false },
    { ...starts[1], group: "starting", faceDown: false },
    {
      row: 5,
      col: 1,
      group: "far",
      faceDown: true,
      revealAtSetup: true,
      secretFeatures: ["settlement"],
      ...(owner === undefined ? {} : { settlement: { ownerStart: owner } })
    }
  ];
}

function build(owner?: number): GameState {
  return createAdventureGameState({
    seed: "preassigned-settlement-board",
    scenarioId: "skirmish",
    difficulty: "normal",
    rollFirstPlayer: false,
    startingBonus: false,
    customMap: tiles(owner)
  });
}

function settlementField(state: GameState): MapFieldState {
  const tile = Object.values(state.adventure!.tiles).find((candidate) => candidate.group === "far");
  const field = getTileFootprintSpaceIds(tile!)
    .map((spaceId) => state.adventure!.fields[spaceId])
    .find((candidate) => candidate?.location === "settlement");
  if (!field) {
    throw new Error("no settlement field was carved");
  }
  return field;
}

describe("the map draws a pre-assigned settlement as its owner's", () => {
  it("paints the owner's flag on the settlement hex from turn 1", () => {
    const state = build(1);
    const field = settlementField(state);
    expect(field.flagOwnerId, "the engine flagged it for S2's seat").toBe("p2");

    const { container } = board(state);
    const flag = container.querySelector(`[data-field-flag-space="${field.spaceId}"]`);
    expect(flag, "the settlement hex wears a flag marker").toBeTruthy();
    expect(flag!.getAttribute("data-field-flag"), "…naming the owning seat").toBe("p2");
    // It is a real coloured flag, not a placeholder.
    expect(flag!.querySelector("path")?.getAttribute("fill")).toBeTruthy();

    // CONTROL — the same revealed settlement with no ownerStart wears no flag.
    cleanup();
    const control = build();
    const plain = settlementField(control);
    expect(plain.flagOwnerId).toBeNull();
    expect(
      board(control).container.querySelector(`[data-field-flag-space="${plain.spaceId}"]`),
      "CONTROL: an unowned settlement has no flag"
    ).toBeNull();
  });
});

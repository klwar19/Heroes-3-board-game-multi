// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { HexMapBoard } from "./screen";
import { carveColoredGateField, instantiateTile } from "@/engine/adventure";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  getPlayerView,
  getTileFootprintSpaceIds,
  type GameState,
  type MapTileState
} from "@/engine";

afterEach(cleanup);

function adv(state: GameState) {
  if (!state.adventure) {
    throw new Error("no adventure state");
  }
  return state.adventure;
}

function setAllEmpty(state: GameState, tile: MapTileState): void {
  for (const spaceId of getTileFootprintSpaceIds(tile)) {
    const field = adv(state).fields[spaceId];
    if (!field) {
      continue;
    }
    field.location = "empty_field";
    delete field.difficulty;
    delete field.resource;
    delete field.amount;
    field.blackCube = false;
    field.flagOwnerId = null;
    field.everFlagged = false;
  }
}

// A colored Gate is "a Monolith with a color". On the real board it draws the
// MONOLITH artwork tinted by a colored ring + a readable pair-number badge — for
// BOTH tile-carved and standalone gate fields (jsdom pins hrefs/labels, not px).
describe("Colored Gate field — board art (monolith tinted with its pair color)", () => {
  function boardWithGate(gatePair: 1 | 2 | 3 | 4, standalone: boolean): { container: HTMLElement } {
    let state = createAdventureGameState({
      seed: "gate-art-ui",
      difficulty: "normal",
      rollFirstPlayer: false,
      creatureBanks: false
    });
    state.activePlayerId = "p1";
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = applyAction(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] }).state;
    }
    const surface = instantiateTile(adv(state), "F3", { row: 24, col: 12 }, 0, false);
    setAllEmpty(state, surface);
    const gateHex = getTileFootprintSpaceIds(surface)[1];
    carveColoredGateField(adv(state), gateHex, gatePair);
    if (standalone) {
      // Mark it standalone so the render path for an off-tile gate is exercised too.
      adv(state).fields[gateHex]!.standalone = true;
    }
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
    return { container };
  }

  it("a tile-carved colored gate renders the MONOLITH art href PLUS a pair-number badge", () => {
    const { container } = boardWithGate(2, false);
    const mark = container.querySelector(".hexGateMark");
    expect(mark, "the gate mark rendered").toBeTruthy();
    // The monolith artwork is present (a colored Gate is a colored Monolith)…
    const art = mark!.querySelector("image.hexGateMonolith");
    expect(art?.getAttribute("href")).toMatch(/tokens\/monolith/);
    // …and the readable pair-number badge names the pair (colour-blind-safe).
    const texts = [...mark!.querySelectorAll("text")].map((node) => node.textContent);
    expect(texts).toContain("2");
    // A colored ring identifies the pair (a stroked circle carrying the tint).
    expect(mark!.querySelector("circle[stroke]"), "colored ring present").toBeTruthy();
  });

  it("a standalone colored gate renders the same monolith-art-plus-color mark", () => {
    const { container } = boardWithGate(1, true);
    const mark = container.querySelector(".hexGateMark");
    expect(mark, "standalone gate mark rendered").toBeTruthy();
    expect(mark!.querySelector("image.hexGateMonolith")?.getAttribute("href")).toMatch(/tokens\/monolith/);
    expect([...mark!.querySelectorAll("text")].map((node) => node.textContent)).toContain("1");
  });
});

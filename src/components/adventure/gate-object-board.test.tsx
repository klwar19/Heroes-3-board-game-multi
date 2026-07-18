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

// A Teleport Gate is "a Monolith with a color". On the real board it draws its
// OWN per-color portal artwork plus a colored ring + a readable pair-number
// badge — for BOTH tile-carved and standalone gate fields (jsdom pins
// hrefs/labels, not px).
describe("Teleport Gate field — board art (per-color portal + pair badge)", () => {
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

  it("a tile-carved Teleport Gate renders its PER-COLOR portal art PLUS a pair-number badge", () => {
    const { container } = boardWithGate(2, false);
    const mark = container.querySelector(".hexGateMark");
    expect(mark, "the gate mark rendered").toBeTruthy();
    // The gate's own per-color portal art (blue for pair 2) — the old
    // tinted-monolith rendering is retired.
    const art = mark!.querySelector("image.hexGateMonolith");
    expect(art?.getAttribute("href")).toMatch(/tokens\/teleport-gate-blue/);
    // …and the readable pair-number badge names the pair (colour-blind-safe).
    const texts = [...mark!.querySelectorAll("text")].map((node) => node.textContent);
    expect(texts).toContain("2");
    // A colored ring identifies the pair (a stroked circle carrying the tint).
    expect(mark!.querySelector("circle[stroke]"), "colored ring present").toBeTruthy();
  });

  it("a standalone Teleport Gate renders the same per-color portal mark", () => {
    const { container } = boardWithGate(1, true);
    const mark = container.querySelector(".hexGateMark");
    expect(mark, "standalone gate mark rendered").toBeTruthy();
    expect(mark!.querySelector("image.hexGateMonolith")?.getAttribute("href")).toMatch(/tokens\/teleport-gate-red/);
    expect([...mark!.querySelectorAll("text")].map((node) => node.textContent)).toContain("1");
  });
});

describe("Designed token on a hidden tile", () => {
  it("renders on the exact reserved physical hex instead of the tile centre", () => {
    const state = createAdventureGameState({
      seed: "hidden-token-slot-ui",
      difficulty: "normal",
      rollFirstPlayer: false,
      creatureBanks: false
    });
    const tile = instantiateTile(adv(state), "N1", { row: 24, col: 12 }, 0, true);
    const reserved = getTileFootprintSpaceIds(tile)[2];
    adv(state).tiles[tile.id].pendingToken = {
      kind: "gate",
      pair: 3,
      preferredSpaceId: reserved
    };

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

    const slot = container.querySelector(".tileBackPendingTokenSlot");
    expect(slot, "reserved-hex ring rendered").toBeTruthy();
    expect(slot?.getAttribute("data-space-id")).toBe(reserved);
    expect(container.querySelector(".tileBackPendingToken"), "token art rendered on the ring").toBeTruthy();
  });
});

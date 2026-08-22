// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { HexMapBoard } from "./screen";
import { instantiateTile } from "@/engine/adventure";
import { coreFactionDefinitions } from "@/data/factions/core";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  getPlayerView,
  getTileFootprintSpaceIds,
  type GameAction,
  type GameState
} from "@/engine";

afterEach(cleanup);

/**
 * USER RULE 2026-08-22: a REVEALED Random Town must tell the table which
 * faction defends it (it is fixed from that moment), while the GATE position
 * and the defender layout stay unknown until the army is set.
 *
 * jsdom cannot compute CSS, so this pins the DOM contract only: the crest
 * <image> on the hex (carrying the faction id) plus the hover-tooltip clause,
 * each with a no-faction CONTROL.
 */
function boardWithRandomTown(seed: string): { state: GameState; faction: string } {
  let state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  state.activePlayerId = "p1";
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyAction(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] }).state;
  }
  // Tile C5 slot 0 is the printed Ⅶ Random Town; revealed face up.
  const tile = instantiateTile(state.adventure!, "C5", { row: 24, col: 12 }, 0, false);
  const spaceId = getTileFootprintSpaceIds(tile)[0]!;
  expect(state.adventure!.fields[spaceId]!.location).toBe("random_town");
  // A real action runs the engine tail that publishes the defending faction.
  state = applyAction(state, { type: "JOIN_ROOM", clientId: "c1", name: "watcher" } as GameAction).state;
  const faction = state.adventure!.fields[spaceId]!.faction!;
  expect(faction).toBeTruthy();
  return { state, faction };
}

function renderBoard(state: GameState): HTMLElement {
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

describe("live map board — a revealed Random Town wears its defender's crest", () => {
  it("draws the faction crest on the hex and names it in the tooltip", () => {
    const { state, faction } = boardWithRandomTown("rt-board-crest");
    const container = renderBoard(state);

    const crest = container.querySelector<SVGImageElement>("image.hexRandomTownFaction");
    expect(crest, "the revealed Random Town hex carries a crest").toBeTruthy();
    expect(crest!.getAttribute("data-random-town-faction")).toBe(faction);
    expect(crest!.getAttribute("href")).toContain(`town-icon-${faction}`);

    const name = coreFactionDefinitions[faction]!.name;
    const titles = [...container.querySelectorAll("title")].map((node) => node.textContent ?? "");
    expect(titles.some((text) => text.includes(`defended by ${name} units`))).toBe(true);
  });

  it("shows nothing while the defending faction is unknown (CONTROL)", () => {
    const { state } = boardWithRandomTown("rt-board-control");
    // Legacy snapshot / not-yet-published shape: no faction on the field.
    for (const field of Object.values(state.adventure!.fields)) {
      if (field.location === "random_town") {
        delete field.faction;
      }
    }
    const container = renderBoard(state);

    expect(container.querySelector("image.hexRandomTownFaction")).toBeNull();
    const titles = [...container.querySelectorAll("title")].map((node) => node.textContent ?? "");
    expect(titles.some((text) => text.includes("defended by"))).toBe(false);
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { HexMapBoard } from "./screen";
import { instantiateTile } from "@/engine/adventure";
import {
  applyAction,
  createAdventureGameState,
  fieldLayer,
  getLegalActions,
  getPlayerView,
  getReachableHeroPaths,
  getTileFootprintSpaceIds,
  hexSpaceId,
  recomputeSubterraneanGates,
  tileLatticeNeighbors,
  type GameAction,
  type GameState,
  type MapFieldState,
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

function gateHalfTo(state: GameState, towardTileId: string): MapFieldState | undefined {
  return Object.values(adv(state).fields).find(
    (field) => field.location === "subterranean_gate" && field.gateToTileId === towardTileId
  );
}

/**
 * A Surface tile with an adjacent face-down Subterranean tile, the Surface gate
 * already carved, and p1's Main Hero parked on the Surface centre with movement
 * to spend. This is the live board state a client would receive.
 */
function gateBoardState(): { state: GameState; surface: MapTileState; underground: MapTileState } {
  let state = createAdventureGameState({ seed: "subt-gate-ui", difficulty: "normal", rollFirstPlayer: false });
  state.activePlayerId = "p1";
  if (state.players.p1.needsHandRefresh) {
    const result = applyAction(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    expect(result.errors).toHaveLength(0);
    state = result.state;
  }
  const surfaceCenter = { row: 24, col: 12 };
  const surface = instantiateTile(adv(state), "F3", surfaceCenter, 0, false);
  const underground = instantiateTile(adv(state), "U1", tileLatticeNeighbors(surfaceCenter)[0], 0, true);
  setAllEmpty(state, surface);
  recomputeSubterraneanGates(adv(state));

  const hero = state.heroes.hero_p1;
  hero.spaceId = hexSpaceId(surfaceCenter);
  hero.movementPoints = 8;
  hero.movementHaltedThisTurn = false;
  return { state, surface, underground };
}

/**
 * Renders the real board and routes every click through the engine reducer,
 * exactly like the server does: the click dispatches a GameAction, the engine
 * produces the next state, and the board re-renders from it. `latest()` reads
 * the live state back so assertions can inspect what the "server" computed.
 */
function renderLiveBoard(initial: GameState): { container: HTMLElement; latest: () => GameState } {
  let live = initial;
  function Harness(): React.JSX.Element {
    const [state, setState] = useState(initial);
    live = state;
    return (
      <HexMapBoard
        legalActions={getLegalActions(state, "p1")}
        moveCue={null}
        onAction={(action: GameAction) => {
          const result = applyAction(state, action);
          expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
          setState(result.state);
        }}
        placement={null}
        state={state}
        view={getPlayerView(state, "p1")}
        viewerPlayerId="p1"
      />
    );
  }
  const { container } = render(<Harness />);
  return { container, latest: () => live };
}

function hex(container: HTMLElement, spaceId: string): HTMLElement {
  const cell = container.querySelector(`[data-space-id="${spaceId}"]`);
  if (!cell) {
    throw new Error(`no hex rendered for ${spaceId}`);
  }
  return cell as unknown as HTMLElement;
}

function clickButton(container: HTMLElement, name: RegExp): void {
  const button = within(container).getByRole("button", { name });
  fireEvent.click(button);
}

describe("Subterranean Gate — real board, real engine, click on geometry", () => {
  it("clicking the gate hex discovers across the divide; clicking a rotation then crossing it carries the hero underground", () => {
    const { state, surface, underground } = gateBoardState();
    const gateSpaceId = gateHalfTo(state, underground.id)!.spaceId;
    const { container, latest } = renderLiveBoard(state);

    // 1) The gate hex renders as a reachable move target on the Surface tile.
    const gateCell = hex(container, gateSpaceId);
    expect(gateCell.classList.contains("moveTarget")).toBe(true);

    // 2) Click the gate, then confirm the move — the engine reveals the far tile
    //    for free and pauses for its rotation (the divide is crossed by entering).
    fireEvent.click(gateCell);
    clickButton(container, /Move there/i);
    expect(latest().heroes.hero_p1.spaceId).toBe(gateSpaceId);
    expect(latest().adventure!.tiles[underground.id].faceDown).toBe(false);
    expect(latest().adventure!.pendingTileChoice?.tileInstanceId).toBe(underground.id);

    // 3) Confirm the rotation — the entrance is carved on the underground tile
    //    and the two halves link into one crossing.
    clickButton(container, /Confirm/i);
    const entrance = gateHalfTo(latest(), surface.id);
    expect(entrance).toBeDefined();
    expect(getTileFootprintSpaceIds(underground)).toContain(entrance!.spaceId);
    expect(latest().adventure!.fields[gateSpaceId]!.gateLinkSpaceId).toBe(entrance!.spaceId);

    // 4) Now cross: a hex on the underground tile is reachable only through the
    //    gate. Click it and move — the hero ends up on the Subterranean layer.
    const reachable = getReachableHeroPaths(latest(), latest().heroes.hero_p1);
    const undergroundTarget = [...reachable.keys()].find(
      (spaceId) => fieldLayer(latest(), spaceId) === "subterranean" && spaceId !== entrance!.spaceId
    );
    expect(undergroundTarget, "an underground hex must be reachable through the gate").toBeTruthy();
    // The hero is parked on the gate; the only way across is the entrance, so the
    // first step of the underground path is the linked entrance half.
    expect(reachable.get(undergroundTarget!)!.path[0]).toBe(entrance!.spaceId);

    fireEvent.click(hex(container, undergroundTarget!));
    clickButton(container, /Move there/i);
    expect(latest().heroes.hero_p1.spaceId).toBe(undergroundTarget);
    expect(fieldLayer(latest(), latest().heroes.hero_p1.spaceId!)).toBe("subterranean");
  });

  it("does NOT offer the face-down Subterranean tile as an across-the-divide discovery from the Surface", () => {
    const { state, surface, underground } = gateBoardState();
    // Stand the hero on a Surface hex touching the underground tile, but NOT on
    // the gate: ordinary discovery must refuse to cross the layer divide.
    const undergroundHexes = new Set(getTileFootprintSpaceIds(underground));
    const touchingSurface = getTileFootprintSpaceIds(surface).find((spaceId) => {
      const coord = spaceId.split(":");
      const row = Number(coord[1]);
      const col = Number(coord[2]);
      const neighbours = [
        hexSpaceId({ row: row - 1, col }),
        hexSpaceId({ row: row + 1, col }),
        hexSpaceId({ row, col: col - 1 }),
        hexSpaceId({ row, col: col + 1 }),
        hexSpaceId({ row: row - 1, col: col - 1 }),
        hexSpaceId({ row: row + 1, col: col - 1 }),
        hexSpaceId({ row: row - 1, col: col + 1 }),
        hexSpaceId({ row: row + 1, col: col + 1 })
      ];
      return spaceId !== gateHalfTo(state, underground.id)!.spaceId && neighbours.some((n) => undergroundHexes.has(n));
    });
    expect(touchingSurface).toBeTruthy();
    state.heroes.hero_p1.spaceId = touchingSurface!;

    // The engine offers no DISCOVER_TILE for the underground tile (the divide).
    const discover = getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "DISCOVER_TILE" && legal.action.tileInstanceId === underground.id
    );
    expect(discover).toHaveLength(0);

    // And the board renders the underground flower as a plain face-down tile,
    // never as a discoverable one.
    const { container } = renderLiveBoard(state);
    const undergroundCells = container.querySelectorAll(`[data-tile-id="${underground.id}"]`);
    expect(undergroundCells.length).toBeGreaterThan(0);
    undergroundCells.forEach((cell) => expect(cell.classList.contains("discoverable")).toBe(false));
  });
});

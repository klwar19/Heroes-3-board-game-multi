// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { HexMapBoard, PromptTray } from "./screen";
import { instantiateTile } from "@/engine/adventure";
import { SUBTERRANEAN_GATE_TOKEN_IMAGES } from "@/data/assets/homm-assets";
import {
  applyAction,
  createAdventureGameState,
  fieldLayer,
  getLegalActions,
  getPlayerView,
  getReachableHeroPaths,
  getTileFootprintSpaceIds,
  hexNeighbors,
  hexSpaceId,
  parseHexSpaceId,
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
  let state = createAdventureGameState({ seed: "subt-gate-ui", difficulty: "normal", rollFirstPlayer: false, chooseSubterraneanGate: false });
  state.activePlayerId = "p1";
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
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

describe("Subterranean Gate — a covered Field is unusable (visual + click)", () => {
  /** Surface ring hexes that touch the underground tile (the shared seam). */
  function surfaceSeam(surface: MapTileState, underground: MapTileState): string[] {
    const undergroundHexes = new Set(getTileFootprintSpaceIds(underground));
    return getTileFootprintSpaceIds(surface).filter((spaceId) =>
      hexNeighbors(parseHexSpaceId(spaceId)!).some((neighbour) => undergroundHexes.has(hexSpaceId(neighbour)))
    );
  }

  it("draws the gate token over a covered Mine (not the Mine) and lets the hero walk through with no Mine effect", () => {
    let state = createAdventureGameState({ seed: "subt-gate-mine-ui", difficulty: "normal", rollFirstPlayer: false, chooseSubterraneanGate: false });
    state.activePlayerId = "p1";
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      const refreshed = applyAction(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
      expect(refreshed.errors).toHaveLength(0);
      state = refreshed.state;
    }
    const surfaceCenter = { row: 24, col: 12 };
    const surface = instantiateTile(adv(state), "F3", surfaceCenter, 0, false);
    const underground = instantiateTile(adv(state), "U1", tileLatticeNeighbors(surfaceCenter)[0], 0, true);
    setAllEmpty(state, surface);

    // Bury the whole seam under guarded gold Mines, so the gate must cover one.
    for (const spaceId of surfaceSeam(surface, underground)) {
      const field = adv(state).fields[spaceId]!;
      field.location = "mine";
      field.difficulty = 5;
      field.resource = "gold";
      field.amount = 5;
    }
    recomputeSubterraneanGates(adv(state));
    const gateSpaceId = Object.values(adv(state).fields).find(
      (field) => field.location === "subterranean_gate" && field.gateToTileId === underground.id
    )!.spaceId;

    const hero = state.heroes.hero_p1;
    hero.spaceId = hexSpaceId(surfaceCenter);
    hero.movementPoints = 8;
    hero.movementHaltedThisTurn = false;

    const { container, latest } = renderLiveBoard(state);

    // VISUAL: the Subterranean Gate token is drawn on the covered hex (the Mine
    // art is replaced by the gate), and the hex is a plain walk-through target —
    // not a blocked or guarded stop.
    const token = container.querySelector(`image.locationToken[data-space-id="${gateSpaceId}"]`);
    expect(token).toBeTruthy();
    expect(token!.getAttribute("href")).toContain(SUBTERRANEAN_GATE_TOKEN_IMAGES.surface);
    const gateCell = hex(container, gateSpaceId);
    expect(gateCell.classList.contains("moveTarget")).toBe(true);
    expect(gateCell.classList.contains("blocked")).toBe(false);

    // CLICK: walking onto the former Mine does the gate thing (reveals the far
    // tile) and nothing of the Mine — no combat, and the field never flags.
    const goldBefore = latest().players.p1.resources.gold;
    fireEvent.click(gateCell);
    clickButton(container, /Move there/i);
    expect(latest().heroes.hero_p1.spaceId).toBe(gateSpaceId);
    expect(latest().combat).toBeFalsy();
    expect(latest().adventure!.fields[gateSpaceId]!.flagOwnerId).toBeNull();
    expect(latest().players.p1.resources.gold).toBe(goldBefore);
    expect(latest().adventure!.tiles[underground.id].faceDown).toBe(false);
  });
});

describe("Subterranean Gate — UI affordances so players understand the crossing", () => {
  it("marks a reachable gate hex with a '↧ descend' cue", () => {
    const { state, underground } = gateBoardState();
    const gateSpaceId = gateHalfTo(state, underground.id)!.spaceId;
    const { container } = renderLiveBoard(state);

    // The gate is a reachable move target (hero stands on the Surface tile).
    expect(hex(container, gateSpaceId).classList.contains("moveTarget")).toBe(true);
    // …and it carries the descend cue, so the cave-mouth reads as a doorway.
    const cues = [...container.querySelectorAll(".hexGateCue")].map((node) => node.textContent);
    expect(cues.some((text) => text?.includes("descend"))).toBe(true);
  });

  it("a hidden cavern tile shows the 'via Subterranean Gate' hint and explains the divide on click", () => {
    const { state, surface, underground } = gateBoardState();
    // Stand the hero on a Surface hex NOT on the gate, so the cavern stays a
    // plain hidden tile the player cannot discover across the divide.
    const undergroundHexes = new Set(getTileFootprintSpaceIds(underground));
    const gateSpaceId = gateHalfTo(state, underground.id)!.spaceId;
    const touchingSurface = getTileFootprintSpaceIds(surface).find(
      (spaceId) =>
        spaceId !== gateSpaceId &&
        hexNeighbors(parseHexSpaceId(spaceId)!).some((n) => undergroundHexes.has(hexSpaceId(n)))
    )!;
    state.heroes.hero_p1.spaceId = touchingSurface;

    const { container } = renderLiveBoard(state);

    // The cavern flower is tagged needsGate (not discoverable) and carries the
    // standing "via Subterranean Gate" hint label.
    const cavernCells = [...container.querySelectorAll(`[data-tile-id="${underground.id}"]`)];
    expect(cavernCells.length).toBeGreaterThan(0);
    expect(cavernCells.every((cell) => cell.classList.contains("needsGate"))).toBe(true);
    const hints = [...container.querySelectorAll(".hexCavernHint")].map((node) => node.textContent);
    expect(hints.some((text) => text?.includes("Subterranean Gate"))).toBe(true);

    // Clicking the hidden cavern explains WHY/HOW instead of doing nothing.
    expect(container.querySelector(".gateHintFloat")).toBeNull();
    fireEvent.click(cavernCells[0] as unknown as HTMLElement);
    const hintCard = container.querySelector(".gateHintFloat");
    expect(hintCard, "tap explains the Subterranean Gate divide").toBeTruthy();
    expect(hintCard!.textContent).toMatch(/Subterranean Gate/i);
  });
});

describe("Subterranean Gate — pick-on-reveal placement renders as a real choice", () => {
  /** A live state whose cavern reveal opened the path-up placement choice for p1. */
  function pathUpChoiceState(): { state: GameState; surface: MapTileState } {
    let state = createAdventureGameState({
      seed: "subt-gate-choice-ui",
      difficulty: "normal",
      rollFirstPlayer: false,
      chooseSubterraneanGate: true
    });
    state.activePlayerId = "p1";
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = applyAction(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] }).state;
    }
    const surfaceCenter = { row: 24, col: 12 };
    const surface = instantiateTile(adv(state), "F3", surfaceCenter, 0, false);
    const cavern = instantiateTile(adv(state), "U1", tileLatticeNeighbors(surfaceCenter)[0], 0, true);
    setAllEmpty(state, surface);
    recomputeSubterraneanGates(adv(state)); // auto surface gate toward the face-down cavern
    // Reveal the cavern through the real reducer so the path-up choice opens.
    adv(state).tiles[cavern.id].faceDown = false;
    adv(state).tiles[cavern.id].awaitingRotation = true;
    adv(state).pendingTileChoice = { tileInstanceId: cavern.id, playerId: "p1", kind: "reveal" };
    for (const rotation of [0, 1, 2, 3, 4, 5]) {
      const result = applyAction(state, { type: "SET_TILE_ROTATION", playerId: "p1", tileInstanceId: cavern.id, rotation });
      if (result.errors.length === 0) {
        return { state: result.state, surface };
      }
    }
    throw new Error("cavern did not reveal");
  }

  /** Renders the real PromptTray (the production surface for OPTION_CHOICE) and
   *  routes every click through the engine, exactly like the app screen does. */
  function renderLivePrompt(initial: GameState): { container: HTMLElement; latest: () => GameState } {
    let live = initial;
    function Harness(): React.JSX.Element {
      const [state, setState] = useState(initial);
      live = state;
      return (
        <PromptTray
          legalActions={getLegalActions(state, "p1")}
          onAction={(action: GameAction) => {
            const result = applyAction(state, action);
            expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
            setState(result.state);
          }}
          state={state}
          viewerPlayerId="p1"
        />
      );
    }
    const { container } = render(<Harness />);
    return { container, latest: () => live };
  }

  it("shows the placement options as buttons and a click carves + links the crossing", () => {
    const { state, surface } = pathUpChoiceState();
    expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context === "subterranean-gate-placement").toBe(
      true
    );
    const { container, latest } = renderLivePrompt(state);

    // The choice surfaces as a dialog with a button per candidate hex.
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog, "the gate placement choice renders").toBeTruthy();
    expect(dialog!.getAttribute("aria-label")).toMatch(/path up|gate/i);
    const options = [...container.querySelectorAll(".promptOptions .commandButton")];
    expect(options.length, "one button per candidate placement").toBeGreaterThanOrEqual(2);

    // Clicking a placement routes CHOOSE_OPTION through the engine and completes
    // the crossing: the entrance is carved and linked to the surface gate.
    fireEvent.click(options[0] as unknown as HTMLElement);
    const resolvedChoice = latest().pendingChoice;
    expect(
      resolvedChoice?.type === "OPTION_CHOICE" && resolvedChoice.context === "subterranean-gate-placement"
    ).toBe(false);
    const entrance = Object.values(latest().adventure!.fields).find(
      (field) => field.location === "subterranean_gate" && field.gateToTileId === surface.id
    );
    expect(entrance, "the entrance half is carved").toBeDefined();
    expect(entrance!.gateLinkSpaceId, "the crossing is linked").toBeTruthy();
  });
});

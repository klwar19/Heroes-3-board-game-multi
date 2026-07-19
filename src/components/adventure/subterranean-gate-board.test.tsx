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

    // 3) Confirm the rotation. Reveal chain is bank → gate; choose-off auto-carves
    //    the gate after the bank. Board-only harness has no PromptTray — resolve
    //    the bank via the engine, remount, then continue.
    clickButton(container, /Confirm/i);
    let postRotate = latest();
    const bankChoice = postRotate.pendingChoice;
    if (bankChoice?.type === "OPTION_CHOICE" && bankChoice.context === "place-creature-bank") {
      const declined = applyAction(postRotate, {
        type: "CHOOSE_OPTION",
        playerId: "p1",
        choiceId: bankChoice.id,
        optionIndex: bankChoice.options.length - 1
      });
      expect(declined.errors).toHaveLength(0);
      postRotate = declined.state;
    }
    const entrance = gateHalfTo(postRotate, surface.id);
    expect(entrance).toBeDefined();
    expect(getTileFootprintSpaceIds(underground)).toContain(entrance!.spaceId);
    expect(postRotate.adventure!.fields[gateSpaceId]!.gateLinkSpaceId).toBe(entrance!.spaceId);

    cleanup();
    const { container: board, latest: live } = renderLiveBoard(postRotate);

    // 4) Now cross: a hex on the underground tile is reachable only through the
    //    gate. Click it and move — the hero ends up on the Subterranean layer.
    const reachable = getReachableHeroPaths(live(), live().heroes.hero_p1);
    const undergroundTarget = [...reachable.keys()].find(
      (spaceId) => fieldLayer(live(), spaceId) === "subterranean" && spaceId !== entrance!.spaceId
    );
    expect(undergroundTarget, "an underground hex must be reachable through the gate").toBeTruthy();
    // The hero is parked on the gate; the only way across is the entrance, so the
    // first step of the underground path is the linked entrance half.
    expect(reachable.get(undergroundTarget!)!.path[0]).toBe(entrance!.spaceId);

    fireEvent.click(hex(board, undergroundTarget!));
    clickButton(board, /Move there/i);
    expect(live().heroes.hero_p1.spaceId).toBe(undergroundTarget);
    expect(fieldLayer(live(), live().heroes.hero_p1.spaceId!)).toBe("subterranean");
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

describe("Underground designation — the live board marks a flagged tile", () => {
  it("tags a revealed flagged tile's hexes with data-underground; a plain Far tile has none (CONTROL)", () => {
    let state = createAdventureGameState({ seed: "ug-cue", difficulty: "normal", rollFirstPlayer: false, chooseSubterraneanGate: false });
    state.activePlayerId = "p1";
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = applyAction(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] }).state;
    }
    const flagged = instantiateTile(adv(state), "F1", { row: 24, col: 12 }, 0, false);
    flagged.underground = true; // exactly what setup writes for plan.underground
    const plain = instantiateTile(adv(state), "F3", { row: 40, col: 24 }, 0, false);
    setAllEmpty(state, flagged);
    setAllEmpty(state, plain);

    const { container } = renderLiveBoard(state);
    const flaggedHex = hex(container, hexSpaceId({ row: flagged.centerRow, col: flagged.centerCol }));
    expect(flaggedHex.getAttribute("data-underground"), "flagged tile hex carries the layer cue").toBe("true");
    const plainHex = hex(container, hexSpaceId({ row: plain.centerRow, col: plain.centerCol }));
    expect(plainHex.getAttribute("data-underground"), "a plain Surface Far tile has no cue").toBeNull();
  });

  it("a face-down flagged tile shows the 'needs a Subterranean Gate' hint + data-underground, just like a cavern", () => {
    let state = createAdventureGameState({ seed: "ug-cue-facedown", difficulty: "normal", rollFirstPlayer: false, chooseSubterraneanGate: false });
    state.activePlayerId = "p1";
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = applyAction(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] }).state;
    }
    const surfaceCenter = { row: 24, col: 12 };
    const surface = instantiateTile(adv(state), "F3", surfaceCenter, 0, false);
    const flagged = instantiateTile(adv(state), "F1", tileLatticeNeighbors(surfaceCenter)[0], 0, true);
    flagged.underground = true;
    setAllEmpty(state, surface);
    recomputeSubterraneanGates(adv(state));

    // Park the hero on a Surface hex touching the flagged tile but NOT on the gate.
    const flaggedHexes = new Set(getTileFootprintSpaceIds(flagged));
    const gateSpaceId = gateHalfTo(state, flagged.id)?.spaceId;
    const touchingSurface = getTileFootprintSpaceIds(surface).find(
      (spaceId) =>
        spaceId !== gateSpaceId &&
        hexNeighbors(parseHexSpaceId(spaceId)!).some((n) => flaggedHexes.has(hexSpaceId(n)))
    )!;
    state.heroes.hero_p1.spaceId = touchingSurface;

    const { container } = renderLiveBoard(state);
    const cavernCells = [...container.querySelectorAll(`[data-tile-id="${flagged.id}"]`)];
    expect(cavernCells.length).toBeGreaterThan(0);
    // The flagged face-down tile is not discoverable across the divide (needsGate)…
    expect(cavernCells.every((cell) => cell.classList.contains("needsGate")), "flagged tile reads needs-a-gate").toBe(true);
    // …carries the always-on underground marker…
    expect(cavernCells.every((cell) => cell.getAttribute("data-underground") === "true")).toBe(true);
    // …and the standing "via Subterranean Gate" hint fires (the layer predicate).
    const hints = [...container.querySelectorAll(".hexCavernHint")].map((node) => node.textContent);
    expect(hints.some((text) => text?.includes("Subterranean Gate"))).toBe(true);
  });
});

describe("Subterranean Gate — pick-on-reveal placement renders as a real choice", () => {
  /** Decline an open bank prompt so the reveal chain reaches the gate exit pick. */
  function declineBankIfOpen(state: GameState): GameState {
    const choice = state.pendingChoice;
    if (choice?.type === "OPTION_CHOICE" && choice.context === "place-creature-bank") {
      return applyAction(state, {
        type: "CHOOSE_OPTION",
        playerId: "p1",
        choiceId: choice.id,
        optionIndex: choice.options.length - 1
      }).state;
    }
    return state;
  }

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
    // Reveal the cavern through the real reducer so the path-up choice opens
    // (bank prompt first, then gate exit — decline the bank).
    adv(state).tiles[cavern.id].faceDown = false;
    adv(state).tiles[cavern.id].awaitingRotation = true;
    adv(state).pendingTileChoice = { tileInstanceId: cavern.id, playerId: "p1", kind: "reveal" };
    for (const rotation of [0, 1, 2, 3, 4, 5]) {
      const result = applyAction(state, { type: "SET_TILE_ROTATION", playerId: "p1", tileInstanceId: cavern.id, rotation });
      if (result.errors.length === 0) {
        return { state: declineBankIfOpen(result.state), surface };
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

  it("shows cycle + Confirm controls and Confirm carves + links the crossing", () => {
    const { state, surface } = pathUpChoiceState();
    expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context === "subterranean-gate-placement").toBe(
      true
    );
    const { container, latest } = renderLivePrompt(state);

    // Cycle/Confirm UI (not one button per candidate).
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog, "the gate placement choice renders").toBeTruthy();
    expect(dialog!.getAttribute("aria-label")).toMatch(/path up|gate|exit/i);
    const confirm = [...container.querySelectorAll(".promptOptions .commandButton")].find((button) =>
      /Confirm/i.test(button.textContent ?? "")
    );
    expect(confirm, "Confirm button is offered").toBeTruthy();
    const cycleButtons = [...container.querySelectorAll(".promptOptions .commandButton")].filter((button) =>
      /Previous|Next/i.test(button.textContent ?? "")
    );
    expect(cycleButtons.length, "cycle Previous/Next buttons").toBeGreaterThanOrEqual(2);

    // Confirm routes CHOOSE_OPTION through the engine and completes the crossing.
    fireEvent.click(confirm as unknown as HTMLElement);
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

  /** The candidate hexes + option labels of the open gate-placement choice. */
  function gateChoice(state: GameState): { hexes: string[]; labels: string[] } {
    const choice = state.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE" || choice.context !== "subterranean-gate-placement" || !choice.subterraneanGate) {
      throw new Error("no gate-placement choice open");
    }
    return {
      hexes: choice.subterraneanGate.candidates.map((candidate) => candidate.hex),
      labels: choice.options.map((option) => option.label)
    };
  }

  it("glows the selected path-up exit ON THE MAP; Confirm carves + links it", () => {
    const { state } = pathUpChoiceState();
    const { hexes, labels } = gateChoice(state);
    expect(hexes.length, "≥2 candidate entrance hexes").toBeGreaterThanOrEqual(2);
    const { container, latest } = renderLiveBoard(state);

    // Only the selected candidate is the glowing mapChoiceTarget; others are
    // marked as alternate exits (gateExitCandidate).
    const selected = hexes.find((spaceId) => hex(container, spaceId).classList.contains("mapChoiceTarget"));
    expect(selected, "one selected exit glows").toBeTruthy();
    for (const spaceId of hexes) {
      if (spaceId === selected) {
        continue;
      }
      expect(
        hex(container, spaceId).classList.contains("gateExitCandidate") ||
          hex(container, spaceId).classList.contains("mapChoiceTarget"),
        `${spaceId} is an alternate exit`
      ).toBe(true);
    }
    // Map float: cycle + Confirm.
    const float = container.querySelector(".gateExitFloat");
    expect(float, "gate exit cycle float on the map").toBeTruthy();
    // The full "Path up on the … edge — sacrifices …" label must wrap inside the
    // float (mapFloatLabel is nowrap elsewhere); never clip into unreadable text.
    const floatLabel = float!.querySelector(".mapFloatLabel");
    expect(floatLabel, "gate exit float shows the selected exit label").toBeTruthy();
    expect(floatLabel!.textContent ?? "").toMatch(/Path up on the/);
    const confirm = [...container.querySelectorAll(".gateExitFloat .commandButton")].find((button) =>
      /Confirm/i.test(button.textContent ?? "")
    );
    expect(confirm).toBeTruthy();

    // Labels stay plain-language (compass edge), never raw hex coordinates.
    expect(labels.every((label) => /Path up on the (NE|E|SE|SW|W|NW) edge/.test(label))).toBe(true);
    expect(labels.some((label) => /hex\s*-?\d+\s*,\s*-?\d+/.test(label))).toBe(false);
    // Hex cue is short so the cave-mouth art stays fully visible.
    const selectedCue = container.querySelector(".hexGateChoiceCue.selected");
    expect(selectedCue?.textContent ?? "").toMatch(/path up/i);
    expect(selectedCue?.textContent ?? "").not.toMatch(/path up here/i);

    // Confirm carves the currently selected path-up hex.
    fireEvent.click(confirm as unknown as HTMLElement);
    const resolved = latest().pendingChoice;
    expect(resolved?.type === "OPTION_CHOICE" && resolved.context === "subterranean-gate-placement").toBe(false);
    const chosen = latest().adventure!.fields[selected!];
    expect(chosen?.location, "the selected hex became the entrance").toBe("subterranean_gate");
    expect(chosen?.gateLinkSpaceId, "the crossing is linked").toBeTruthy();
  });

  /** A live state whose Surface-tile reveal opened the GATE-hex placement choice
   *  (the surface tile is revealed next to a still-face-down cavern). */
  function gateHexChoiceState(): { state: GameState; cavern: MapTileState } {
    let state = createAdventureGameState({
      seed: "subt-gate-surface-choice-ui",
      difficulty: "normal",
      rollFirstPlayer: false,
      chooseSubterraneanGate: true
    });
    state.activePlayerId = "p1";
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = applyAction(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] }).state;
    }
    const cavernCenter = { row: 24, col: 12 };
    const cavern = instantiateTile(adv(state), "U1", cavernCenter, 0, true); // face-down cavern (no half yet)
    const surface = instantiateTile(adv(state), "F3", tileLatticeNeighbors(cavernCenter)[0], 0, true);
    // Reveal the SURFACE tile through the real reducer so the gate-hex choice opens
    // (after declining any bank offered first).
    adv(state).tiles[surface.id].faceDown = false;
    adv(state).tiles[surface.id].awaitingRotation = true;
    adv(state).pendingTileChoice = { tileInstanceId: surface.id, playerId: "p1", kind: "reveal" };
    for (const rotation of [0, 1, 2, 3, 4, 5]) {
      const result = applyAction(state, { type: "SET_TILE_ROTATION", playerId: "p1", tileInstanceId: surface.id, rotation });
      if (result.errors.length === 0) {
        return { state: declineBankIfOpen(result.state), cavern };
      }
    }
    throw new Error("surface tile did not reveal");
  }

  it("glows the selected Surface gate exit ON THE MAP; Confirm carves it toward the cavern", () => {
    const { state, cavern } = gateHexChoiceState();
    const { hexes, labels } = gateChoice(state);
    expect(hexes.length, "≥2 candidate gate hexes").toBeGreaterThanOrEqual(2);
    const { container, latest } = renderLiveBoard(state);

    const selected = hexes.find((spaceId) => hex(container, spaceId).classList.contains("mapChoiceTarget"));
    expect(selected, "one selected gate exit glows").toBeTruthy();
    const float = container.querySelector(".gateExitFloat");
    expect(float, "gate exit cycle float on the map").toBeTruthy();
    expect(labels.every((label) => /Gate on the (NE|E|SE|SW|W|NW) edge/.test(label))).toBe(true);
    expect(labels.some((label) => /hex\s*-?\d+\s*,\s*-?\d+/.test(label))).toBe(false);

    // Selecting another candidate then Confirm carves that hex.
    const alternate = hexes.find((spaceId) => spaceId !== selected) ?? selected!;
    fireEvent.click(hex(container, alternate));
    const confirm = [...container.querySelectorAll(".gateExitFloat .commandButton")].find((button) =>
      /Confirm/i.test(button.textContent ?? "")
    );
    expect(confirm).toBeTruthy();
    fireEvent.click(confirm as unknown as HTMLElement);
    const chosen = latest().adventure!.fields[alternate];
    expect(chosen?.location, "the selected hex became the gate").toBe("subterranean_gate");
    expect(chosen?.gateToTileId, "the gate points at the cavern").toBe(cavern.id);
  });

  it("MULTIPLAYER: another player's board shows NO gate-choice glow, float, or click while it is p1's choice", () => {
    const { state } = pathUpChoiceState();
    const { hexes } = gateChoice(state);
    // The choice belongs to p1; render the board exactly as p2's client would.
    const { container } = render(
      <HexMapBoard
        legalActions={getLegalActions(state, "p2")}
        moveCue={null}
        onAction={() => {}}
        placement={null}
        state={state}
        view={getPlayerView(state, "p2")}
        viewerPlayerId="p2"
      />
    );
    // No candidate hex glows, no cue, no exit float — the placement is private
    // to the deciding player (same gating as Dimension Door).
    for (const spaceId of hexes) {
      expect(hex(container, spaceId).classList.contains("mapChoiceTarget"), `${spaceId} must not glow for p2`).toBe(false);
      expect(hex(container, spaceId).classList.contains("gateExitCandidate"), `${spaceId} not a candidate for p2`).toBe(
        false
      );
    }
    expect(container.querySelectorAll(".hexGateChoiceCue").length, "no cue for the non-deciding player").toBe(0);
    expect(container.querySelector(".gateExitFloat"), "no gate float for p2").toBeNull();
  });
});

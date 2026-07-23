// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { HexMapBoard, PromptTray } from "./screen";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  getPlayerView,
  getTileFootprintSpaceIds,
  legalTokenSlotsForTileDef,
  type GameAction,
  type GameState,
  type MapSpaceId,
  type MapTileState
} from "@/engine";
import { carveMapTokenField, instantiateTile } from "@/engine/adventure";
import { allTileDefinitions } from "@/data/map/tiles";

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Monolith / Whirlpool / colored-Gate travel destination picker on the map.
// The engine emits a CHOOSE_ONE tagged `teleport`; the board turns each
// destination into a glowing, clickable EXIT hex that dispatches the SAME
// RESOLVE_VISIT_STEP the tray button does. These jsdom tests pin the wiring
// (classes / data-space-id / dispatch); the CSS glow itself is visual only.
// ---------------------------------------------------------------------------

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

function adv(state: GameState) {
  if (!state.adventure) {
    throw new Error("no adventure");
  }
  return state.adventure;
}

function makeGame(seed: string): GameState {
  let state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false, creatureBanks: false });
  state.activePlayerId = "p1";
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  return state;
}

function setAllEmpty(state: GameState, tile: MapTileState): void {
  for (const spaceId of getTileFootprintSpaceIds(tile)) {
    const field = adv(state).fields[spaceId];
    if (!field) {
      continue;
    }
    field.location = "empty_field";
    delete field.difficulty;
    field.blackCube = false;
    field.flagOwnerId = null;
    field.everFlagged = false;
  }
}

function revealTile(state: GameState, tileId: string): GameState {
  const tile = adv(state).tiles[tileId];
  tile.faceDown = false;
  tile.awaitingRotation = true;
  adv(state).pendingTileChoice = { tileInstanceId: tileId, playerId: "p1", kind: "reveal" };
  for (const rotation of [0, 1, 2, 3, 4, 5]) {
    const result = applyAction(state, { type: "SET_TILE_ROTATION", playerId: "p1", tileInstanceId: tileId, rotation });
    if (result.errors.length === 0) {
      return result.state;
    }
  }
  throw new Error(`no legal rotation revealed ${tileId}`);
}

function placeEmptyTile(state: GameState, tileDefId: string, center: { row: number; col: number }): [GameState, MapTileState] {
  const tile = instantiateTile(adv(state), tileDefId, center, 0, true);
  const revealed = revealTile(state, tile.id);
  setAllEmpty(revealed, adv(revealed).tiles[tile.id]);
  return [revealed, adv(revealed).tiles[tile.id]];
}

function carveToken(state: GameState, tile: MapTileState, slot: number, kind: "monolith" | "whirlpool", number?: -1 | 0 | 1): MapSpaceId {
  const spaceId = getTileFootprintSpaceIds(tile)[slot];
  const field = carveMapTokenField(adv(state), spaceId, kind, number);
  expect(field).toBeTruthy();
  return spaceId;
}

function putHero(state: GameState, spaceId: MapSpaceId): void {
  const hero = state.heroes.hero_p1;
  hero.spaceId = spaceId;
  hero.movementPoints = 3;
  hero.movementHaltedThisTurn = false;
}

/** Three Monoliths → the traveller's-pick CHOOSE_ONE with two FIELD exits. */
function threeMonolithChoice(seed: string): { state: GameState; exitB: MapSpaceId; exitC: MapSpaceId } {
  let state = makeGame(seed);
  const [a, tileA] = placeEmptyTile(state, "F1", { row: 24, col: 12 });
  const [b, tileB] = placeEmptyTile(a, "F3", { row: 30, col: 18 });
  const [c, tileC] = placeEmptyTile(b, "F4", { row: 36, col: 24 });
  state = c;
  const entry = carveToken(state, tileA, 1, "monolith");
  const exitB = carveToken(state, tileB, 2, "monolith");
  const exitC = carveToken(state, tileC, 3, "monolith");
  putHero(state, getTileFootprintSpaceIds(tileA)[0]);
  state = applyOk(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: entry });
  const step = adv(state).pendingVisit?.steps[0];
  if (step?.type !== "CHOOSE_ONE" || !step.teleport) {
    throw new Error("expected the tagged teleport picker to be open");
  }
  return { state, exitB, exitC };
}

function renderBoard(state: GameState, viewer: string, onAction: (action: GameAction) => void): HTMLElement {
  const { container } = render(
    <HexMapBoard
      legalActions={getLegalActions(state, viewer)}
      moveCue={null}
      onAction={onAction}
      placement={null}
      state={state}
      view={getPlayerView(state, viewer)}
      viewerPlayerId={viewer}
    />
  );
  return container;
}

describe("Teleport destination picker — adventure board", () => {
  it("glows every destination hex and dispatches its RESOLVE_VISIT_STEP when clicked", () => {
    const { state, exitB, exitC } = threeMonolithChoice("teleport-board-click");
    const step = adv(state).pendingVisit!.steps[0];
    if (step.type !== "CHOOSE_ONE") {
      throw new Error("no choice");
    }
    const optionIndexByHex = new Map<string, number>();
    step.options.forEach((option, index) => {
      // The trailing "Stay here" option (2026-07-24 rule) has empty steps.
      const inner = option.steps[0];
      if (inner?.type === "TELEPORT_HERO") {
        optionIndexByHex.set(inner.spaceId, index);
      }
    });

    const onAction = vi.fn<(action: GameAction) => void>();
    const container = renderBoard(state, "p1", onAction);

    // Both exits glow as clickable teleport targets — and ONLY those two.
    expect(container.querySelectorAll(".hexCell.teleportTarget").length).toBe(2);
    for (const exit of [exitB, exitC]) {
      const hex = container.querySelector<SVGPolygonElement>(`[data-space-id="${exit}"]`);
      expect(hex, `exit ${exit} on the board`).toBeTruthy();
      expect(hex!.classList.contains("teleportTarget")).toBe(true);
    }

    // Clicking exit B dispatches exactly its option's RESOLVE_VISIT_STEP.
    const hexB = container.querySelector<SVGPolygonElement>(`[data-space-id="${exitB}"]`);
    fireEvent.click(hexB!);
    expect(onAction).toHaveBeenCalledWith({
      type: "RESOLVE_VISIT_STEP",
      playerId: "p1",
      optionIndex: optionIndexByHex.get(exitB)
    });
  });

  it("CONTROL: a non-traveller seat sees no teleport glow (nothing leaks to other players)", () => {
    const { state } = threeMonolithChoice("teleport-board-control");
    // p2 is not the traveller — its view has no visit steps, so no hex is tagged.
    const container = renderBoard(state, "p2", vi.fn());
    expect(container.querySelectorAll(".teleportTarget").length).toBe(0);
    expect(container.querySelectorAll(".teleportTargetFaceDown").length).toBe(0);
  });

  it("makes a face-down destination clickable on its token back hex (no tile face shown)", () => {
    let state = makeGame("teleport-board-facedown");
    const [a, tileA] = placeEmptyTile(state, "F1", { row: 24, col: 12 });
    const [b, tileB] = placeEmptyTile(a, "F3", { row: 30, col: 18 });
    state = b;
    const entry = carveToken(state, tileA, 1, "monolith");
    carveToken(state, tileB, 2, "monolith"); // one carved field exit
    // A THIRD Monolith still rides a face-down tile at a reserved hex.
    const hidden = instantiateTile(adv(state), "N1", { row: 36, col: 24 }, 0, true);
    const preferredSlot = legalTokenSlotsForTileDef(allTileDefinitions.N1, "monolith")[0];
    const preferredHex = getTileFootprintSpaceIds(hidden)[preferredSlot];
    adv(state).tiles[hidden.id].pendingToken = { kind: "monolith", preferredSpaceId: preferredHex };
    putHero(state, getTileFootprintSpaceIds(tileA)[0]);
    state = applyOk(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: entry });

    const step = adv(state).pendingVisit?.steps[0];
    if (step?.type !== "CHOOSE_ONE") {
      throw new Error("no teleport picker");
    }
    const pendingOptionIndex = step.options.findIndex((option) => option.steps[0]?.type === "TOKEN_TELEPORT_REVEAL");
    expect(pendingOptionIndex).toBeGreaterThanOrEqual(0);

    const onAction = vi.fn<(action: GameAction) => void>();
    const container = renderBoard(state, "p1", onAction);

    // The face-down destination is clickable at the token's reserved back hex.
    const backHex = container.querySelector<SVGPolygonElement>(`.teleportTargetFaceDown[data-space-id="${preferredHex}"]`);
    expect(backHex, "clickable face-down exit overlay").toBeTruthy();
    fireEvent.click(backHex!);
    expect(onAction).toHaveBeenCalledWith({
      type: "RESOLVE_VISIT_STEP",
      playerId: "p1",
      optionIndex: pendingOptionIndex
    });
  });
});

describe("Teleport destination picker — prompt tray", () => {
  it("renders themed destination cards with token art and a human label, not bare number buttons", () => {
    const { state } = threeMonolithChoice("teleport-tray-cards");
    const { container } = render(
      <PromptTray legalActions={getLegalActions(state, "p1")} onAction={vi.fn()} state={state} viewerPlayerId="p1" />
    );

    // Dedicated teleport cards: one per destination (each with token art), PLUS
    // the "Stay here" option card (2026-07-24 rule — a decline, no token art).
    const cards = container.querySelectorAll("button.teleportOptionCard");
    expect(cards.length).toBe(3);
    expect(container.querySelectorAll("button.teleportOptionCard .teleportOptionArt img").length).toBe(2);
    // …a human "where" label (never a raw h:row:col id) + a Stay option…
    const text = Array.from(cards)
      .map((card) => card.textContent ?? "")
      .join(" | ");
    expect(text).toMatch(/Monolith/);
    expect(text).toMatch(/Stay/);
    expect(text).not.toMatch(/h:-?\d+:-?\d+/);
    // …and the map hint. No plain commandButton option list is used for teleport.
    expect(container.querySelector(".promptTeleportHint")).toBeTruthy();
    expect(container.querySelectorAll("button.commandButton").length).toBe(0);
  });

  it("shows a colored Gate ring + pair badge on each Gate destination card", () => {
    // Build a three-red-gate picker directly on the pending visit so the tray can
    // render it (the engine wiring itself is covered in map-objects.test.ts).
    let state = makeGame("teleport-tray-gate");
    const [a, tileA] = placeEmptyTile(state, "F1", { row: 24, col: 12 });
    const [b, tileB] = placeEmptyTile(a, "F3", { row: 30, col: 18 });
    const [c, tileC] = placeEmptyTile(b, "F4", { row: 36, col: 24 });
    state = c;
    const exitB = getTileFootprintSpaceIds(tileB)[1];
    const exitC = getTileFootprintSpaceIds(tileC)[1];
    for (const hex of [exitB, exitC]) {
      const field = adv(state).fields[hex]!;
      field.location = "gate";
      field.gatePair = 1;
    }
    adv(state).pendingVisit = {
      heroId: "hero_p1",
      playerId: "p1",
      fieldId: getTileFootprintSpaceIds(tileA)[0],
      steps: [
        {
          type: "CHOOSE_ONE",
          prompt: "Red Gate — choose where to travel",
          teleport: { kind: "gate", pair: 1 },
          options: [
            { label: "red Gate on the far tile at (30, 18)", steps: [{ type: "TELEPORT_HERO", heroId: "hero_p1", spaceId: exitB }] },
            { label: "red Gate on the far tile at (36, 24)", steps: [{ type: "TELEPORT_HERO", heroId: "hero_p1", spaceId: exitC }] }
          ]
        }
      ]
    };

    const { container } = render(
      <PromptTray legalActions={getLegalActions(state, "p1")} onAction={vi.fn()} state={state} viewerPlayerId="p1" />
    );

    const arts = container.querySelectorAll<HTMLElement>("button.teleportOptionCard .teleportOptionArt");
    expect(arts.length).toBe(2);
    // The pair-color ring var is set on every Gate card, and each shows its pair badge.
    for (const art of Array.from(arts)) {
      expect(art.style.getPropertyValue("--teleport-ring")).not.toBe("");
    }
    const badges = container.querySelectorAll(".teleportOptionBadge");
    expect(badges.length).toBe(2);
    expect(Array.from(badges).every((badge) => badge.textContent === "1")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  getTileFootprintSpaceIds,
  tileLatticeNeighbors,
  type GameAction,
  type GameState,
  type MapFieldState,
  type MapTileState
} from "./index";
import { beginFieldVisit, instantiateTile, recomputeSubterraneanGates } from "./adventure";
import type { AdventureState } from "./state";

// ---------------------------------------------------------------------------
// Pick-on-reveal Subterranean Gate placement (default ON):
//   "rotate first, then pick." After a tile's rotation is locked, when its Gate
//   half could sit in more than one spot, the revealing player CHOOSES — which
//   touching hex becomes the gate, later which underground hex is the path up,
//   and which of two Surface tiles a cavern connects to. A lone candidate carves
//   automatically (with a warning). The choice-OFF path (the deterministic
//   nearest-hex carve) is the mutation control that each test diverges from.
// ---------------------------------------------------------------------------

function adv(state: GameState): AdventureState {
  if (!state.adventure) {
    throw new Error("no adventure state");
  }
  return state.adventure;
}

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

function makeGame(chooseSubterraneanGate: boolean): GameState {
  let state = createAdventureGameState({
    seed: "subt-gate-choice",
    difficulty: "normal",
    rollFirstPlayer: false,
    chooseSubterraneanGate
  });
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
    delete field.resource;
    delete field.amount;
    field.blackCube = false;
    field.flagOwnerId = null;
    field.everFlagged = false;
  }
}

/**
 * Reveal a placed (or face-down) tile through the real SET_TILE_ROTATION flow.
 * Does NOT auto-resolve the Creature Bank / gate prompts that may open after
 * rotation — use {@link declineCreatureBankIfOpen} when a test only cares about
 * the subsequent gate exit pick / auto-carve.
 */
function revealTile(state: GameState, tileId: string, playerId = "p1"): GameState {
  const tile = adv(state).tiles[tileId];
  tile.faceDown = false;
  tile.awaitingRotation = true;
  adv(state).pendingTileChoice = { tileInstanceId: tileId, playerId, kind: "reveal" };
  for (const rotation of [0, 1, 2, 3, 4, 5]) {
    const result = applyAction(state, { type: "SET_TILE_ROTATION", playerId, tileInstanceId: tileId, rotation });
    if (result.errors.length === 0) {
      return result.state;
    }
  }
  throw new Error(`no legal rotation revealed ${tileId}`);
}

/** Decline an open Creature Bank place/leave prompt so the reveal chain reaches
 *  the Subterranean Gate exit step (bank → gate → tokens). */
function declineCreatureBankIfOpen(state: GameState, playerId = "p1"): GameState {
  const choice = state.pendingChoice;
  if (choice?.type === "OPTION_CHOICE" && choice.context === "place-creature-bank") {
    return applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId,
      choiceId: choice.id,
      optionIndex: choice.options.length - 1
    });
  }
  return state;
}

/** Reveal and pass the bank step so the gate exit is auto-carved or offered. */
function revealPastBank(state: GameState, tileId: string, playerId = "p1"): GameState {
  return declineCreatureBankIfOpen(revealTile(state, tileId, playerId), playerId);
}

function gateHalfTo(state: GameState, towardTileId: string): MapFieldState | undefined {
  return Object.values(adv(state).fields).find(
    (field) => field.location === "subterranean_gate" && field.gateToTileId === towardTileId
  );
}

function gatesOn(state: GameState, tile: MapTileState): MapFieldState[] {
  return getTileFootprintSpaceIds(tile)
    .map((id) => adv(state).fields[id])
    .filter((field): field is MapFieldState => field?.location === "subterranean_gate");
}

const gatePlacementChoice = (state: GameState) =>
  state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context === "subterranean-gate-placement"
    ? state.pendingChoice
    : null;

function resolveGateChoice(state: GameState, optionIndex: number, playerId = "p1"): GameState {
  const choice = gatePlacementChoice(state);
  if (!choice) {
    throw new Error("no gate placement choice pending");
  }
  return applyOk(state, { type: "CHOOSE_OPTION", playerId, choiceId: choice.id, optionIndex });
}

// --- Anchor: the revealing player picks WHICH surface hex becomes the gate -----

describe("pick-on-reveal: the gate hex", () => {
  /** Reveal a Surface tile next to a face-down cavern; returns the carved gate hex. */
  function autoGateHex(): string {
    const state = makeGame(false);
    const surfaceCenter = { row: 24, col: 12 };
    const cavernCenter = tileLatticeNeighbors(surfaceCenter)[0];
    const surface = instantiateTile(adv(state), "F1", surfaceCenter, 0, true);
    const cavern = instantiateTile(adv(state), "U1", cavernCenter, 0, true);
    const revealed = revealPastBank(state, surface.id);
    // No choice was offered (auto path); the gate carved at the nearest hex.
    expect(gatePlacementChoice(revealed)).toBeNull();
    return gateHalfTo(revealed, cavern.id)!.spaceId;
  }

  it("offers the touching hexes and carves the PLAYER's pick, not the nearest default", () => {
    const autoHex = autoGateHex();

    const state = makeGame(true);
    const surfaceCenter = { row: 24, col: 12 };
    const cavernCenter = tileLatticeNeighbors(surfaceCenter)[0];
    const surface = instantiateTile(adv(state), "F1", surfaceCenter, 0, true);
    const cavern = instantiateTile(adv(state), "U1", cavernCenter, 0, true);

    const revealed = revealPastBank(state, surface.id);
    const choice = gatePlacementChoice(revealed);
    expect(choice, "revealing the Surface tile opens the gate-hex choice").toBeTruthy();
    const candidates = choice!.subterraneanGate!.candidates;
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    // Every candidate is a Surface "gate" half pointing at the cavern.
    expect(candidates.every((c) => c.role === "gate" && c.undergroundTileId === cavern.id)).toBe(true);

    // Pick a candidate that is NOT what the automatic nearest-hex carve chose, so
    // the assertion fails if the engine ignores the player's pick.
    const overrideIndex = candidates.findIndex((c) => c.hex !== autoHex);
    expect(overrideIndex, "a non-default candidate exists").toBeGreaterThanOrEqual(0);
    const chosenHex = candidates[overrideIndex].hex;
    expect(chosenHex).not.toBe(autoHex);

    const after = resolveGateChoice(revealed, overrideIndex);
    const gate = gateHalfTo(after, cavern.id);
    expect(gate, "the gate is carved").toBeDefined();
    expect(gate!.spaceId, "the gate sits on the hex the player chose").toBe(chosenHex);
    // Exactly one gate half on the surface tile (one gate per tile).
    expect(gatesOn(after, surface)).toHaveLength(1);
  });
});

// --- Path up: the player picks WHICH underground hex is the entrance ("later") -

describe("pick-on-reveal: the path up (entrance)", () => {
  function forwardSetup(chooseSubterraneanGate: boolean): { state: GameState; surface: MapTileState; cavern: MapTileState } {
    const state = makeGame(chooseSubterraneanGate);
    const surfaceCenter = { row: 24, col: 12 };
    const cavernCenter = tileLatticeNeighbors(surfaceCenter)[0];
    const surface = instantiateTile(adv(state), "F1", surfaceCenter, 0, false);
    const cavern = instantiateTile(adv(state), "U1", cavernCenter, 0, true);
    setAllEmpty(state, surface);
    // The Surface gate is carved (auto) toward the still face-down cavern.
    recomputeSubterraneanGates(adv(state));
    expect(gateHalfTo(state, cavern.id), "surface gate exists before the cavern is revealed").toBeDefined();
    return { state, surface, cavern };
  }

  it("carves the entrance on the hex the player chooses and links the crossing", () => {
    // Control: choose-off carves the entrance at the nearest hex automatically.
    const auto = forwardSetup(false);
    const autoRevealed = revealPastBank(auto.state, auto.cavern.id);
    const autoEntrance = gateHalfTo(autoRevealed, auto.surface.id)!;
    expect(autoEntrance).toBeDefined();

    const { state, surface, cavern } = forwardSetup(true);
    const revealed = revealPastBank(state, cavern.id);
    const choice = gatePlacementChoice(revealed);
    expect(choice, "revealing the cavern opens the path-up choice").toBeTruthy();
    const candidates = choice!.subterraneanGate!.candidates;
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidates.every((c) => c.role === "entrance" && c.surfaceTileId === surface.id)).toBe(true);

    const overrideIndex = candidates.findIndex((c) => c.hex !== autoEntrance.spaceId);
    expect(overrideIndex).toBeGreaterThanOrEqual(0);
    const chosenHex = candidates[overrideIndex].hex;

    const after = resolveGateChoice(revealed, overrideIndex);
    const entrance = gateHalfTo(after, surface.id);
    expect(entrance!.spaceId, "the entrance is on the player's chosen hex").toBe(chosenHex);
    expect(chosenHex).not.toBe(autoEntrance.spaceId);
    // The two halves link into the one crossing.
    const gate = adv(after).fields[gateHalfTo(after, cavern.id)!.spaceId];
    expect(gate.gateLinkSpaceId).toBe(entrance!.spaceId);
    expect(entrance!.gateLinkSpaceId).toBe(gate.spaceId);
  });
});

// --- Which Surface tile: a cavern touching two Surface tiles ------------------

describe("pick-on-reveal: which Surface tile a cavern joins", () => {
  function twoSurfaceSetup(chooseSubterraneanGate: boolean): {
    state: GameState;
    cavern: MapTileState;
    surfaceA: MapTileState;
    surfaceB: MapTileState;
  } {
    const state = makeGame(chooseSubterraneanGate);
    const cavernCenter = { row: 24, col: 12 };
    const [n0, n1] = tileLatticeNeighbors(cavernCenter);
    const cavern = instantiateTile(adv(state), "U1", cavernCenter, 0, true);
    const surfaceA = instantiateTile(adv(state), "F1", n0, 0, false);
    const surfaceB = instantiateTile(adv(state), "F2", n1, 0, false);
    setAllEmpty(state, surfaceA);
    setAllEmpty(state, surfaceB);
    // Auto carves ONE surface gate toward the (face-down) cavern; the other
    // surface stays sealed until the cavern reveal decides the connection.
    recomputeSubterraneanGates(adv(state));
    return { state, cavern, surfaceA, surfaceB };
  }

  it("lets the player connect the cavern to EITHER touching Surface tile (and clears the loser)", () => {
    // Control: choose-off links the cavern to the auto-picked surface.
    const auto = twoSurfaceSetup(false);
    const autoRevealed = revealPastBank(auto.state, auto.cavern.id);
    const autoLinkedSurface =
      gatesOn(autoRevealed, auto.surfaceA).some((f) => f.gateLinkSpaceId) ? auto.surfaceA : auto.surfaceB;
    const autoOtherSurface = autoLinkedSurface === auto.surfaceA ? auto.surfaceB : auto.surfaceA;
    expect(gatesOn(autoRevealed, autoLinkedSurface).some((f) => f.gateLinkSpaceId)).toBe(true);

    // Choice: pick a candidate that connects the OTHER surface tile.
    const { state, cavern, surfaceA, surfaceB } = twoSurfaceSetup(true);
    const revealed = revealPastBank(state, cavern.id);
    const choice = gatePlacementChoice(revealed);
    expect(choice, "the cavern reveal opens the which-Surface choice").toBeTruthy();
    const candidates = choice!.subterraneanGate!.candidates;
    const partners = new Set(candidates.map((c) => c.surfaceTileId));
    expect(partners.size, "both Surface tiles are offered").toBe(2);

    const otherSurface = autoOtherSurface.id === surfaceA.id ? surfaceA : surfaceB;
    const pickIndex = candidates.findIndex((c) => c.surfaceTileId === otherSurface.id);
    expect(pickIndex).toBeGreaterThanOrEqual(0);
    const after = resolveGateChoice(revealed, pickIndex);

    // The cavern now links to the player's chosen (non-default) surface…
    const chosenGate = gatesOn(after, otherSurface);
    expect(chosenGate).toHaveLength(1);
    expect(chosenGate[0].gateLinkSpaceId, "the chosen surface is linked to the cavern").toBeTruthy();
    // …and the other surface's orphaned auto-gate is gone (reverted to land).
    const loserSurface = otherSurface.id === surfaceA.id ? surfaceB : surfaceA;
    expect(gatesOn(after, loserSurface), "the non-chosen surface keeps no dead gate").toHaveLength(0);
    // One crossing only: exactly two gate halves on the whole map.
    expect(Object.values(adv(after).fields).filter((f) => f.location === "subterranean_gate")).toHaveLength(2);
  });
});

// --- Warning: the auto carve names what it sacrifices -------------------------

describe("gate placement warns what it sacrifices", () => {
  it("emits SUBTERRANEAN_GATE_PLACED naming the Location the gate covered", () => {
    const state = makeGame(false); // auto path
    const surfaceCenter = { row: 24, col: 12 };
    const cavernCenter = tileLatticeNeighbors(surfaceCenter)[0];
    const surface = instantiateTile(adv(state), "F1", surfaceCenter, 0, false);
    const cavern = instantiateTile(adv(state), "U1", cavernCenter, 0, true);
    // The Surface gate is carved (auto) toward the face-down cavern; its warning
    // names the F1 Location the gate covered and is flagged as an automatic carve.
    const revealedSurface = revealPastBank(state, surface.id);
    const surfaceGate = gateHalfTo(revealedSurface, cavern.id)!;
    const surfaceWarn = revealedSurface.eventLog.find(
      (event) => event.type === "SUBTERRANEAN_GATE_PLACED" && event.fieldId === surfaceGate.spaceId
    );
    expect(surfaceWarn, "the surface gate carve warns").toBeDefined();
    if (surfaceWarn?.type === "SUBTERRANEAN_GATE_PLACED") {
      expect(surfaceWarn.chosen).toBe(false);
      expect(surfaceWarn.sacrificed).toBeTruthy();
      expect(surfaceWarn.sacrificed).not.toBe("subterranean_gate");
      expect(surfaceWarn.gateToTileId).toBe(cavern.id);
    }

    // Reveal the cavern: the entrance sacrifices whatever U1's tile art printed on
    // that hex, and the warning names that Location (the captured pre-carve value,
    // never the gate it became). Bank step first — pass it so the auto-carve runs.
    const after = revealPastBank(revealedSurface, cavern.id);
    const entrance = gateHalfTo(after, surface.id)!;
    const entranceWarn = after.eventLog.find(
      (event) => event.type === "SUBTERRANEAN_GATE_PLACED" && event.fieldId === entrance.spaceId
    );
    expect(entranceWarn, "the entrance carve warns").toBeDefined();
    if (entranceWarn?.type === "SUBTERRANEAN_GATE_PLACED") {
      expect(entranceWarn.sacrificed).toBeTruthy();
      expect(entranceWarn.sacrificed).not.toBe("subterranean_gate");
      expect(entranceWarn.gateToTileId).toBe(surface.id);
      expect(entranceWarn.chosen).toBe(false);
    }
  });
});

// --- Subterranean Creature Banks (Near pile), never on the gate hex -----------

describe("subterranean Creature Banks (house rule)", () => {
  it("offers a cavern a Creature Bank from the NEAR pile on its Blocked Field", () => {
    const state = makeGame(false);
    const cavern = instantiateTile(adv(state), "U1", { row: 24, col: 12 }, 0, true);

    const revealed = revealTile(state, cavern.id);
    const choice = revealed.pendingChoice;
    expect(choice?.type === "OPTION_CHOICE" && choice.context === "place-creature-bank").toBe(true);
    if (choice?.type !== "OPTION_CHOICE" || choice.context !== "place-creature-bank") {
      throw new Error("expected a creature-bank offer");
    }
    // A cavern draws from the Near pile (house rule).
    expect(choice.creatureBank?.tier).toBe("near");

    const nearBefore = adv(revealed).creatureBankTokensNear!.length;
    const placed = applyOk(revealed, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 0 });
    // The Blocked Field became a real Creature Bank drawn off the Near pile.
    const bankField = getTileFootprintSpaceIds(cavern)
      .map((id) => adv(placed).fields[id])
      .find((field) => field?.location === "creature_bank");
    expect(bankField, "the cavern's Blocked Field is now a Creature Bank").toBeDefined();
    expect(adv(placed).creatureBankTokensByPlayer!.p1.near.length).toBe(nearBefore - 1);
  });

  it("offers the bank BEFORE the gate exit pick (bank → gate order)", () => {
    // Reveal chain after rotation: Creature Bank first, then Subterranean Gate
    // exit (cycle + confirm when ≥2 candidates). A bank on the Blocked Field
    // that later becomes a gate exit is overwritten when the gate carves.
    const state = makeGame(true);
    const surfaceCenter = { row: 24, col: 12 };
    const cavernCenter = tileLatticeNeighbors(surfaceCenter)[0];
    const surface = instantiateTile(adv(state), "F1", surfaceCenter, 0, false);
    const cavern = instantiateTile(adv(state), "U1", cavernCenter, 0, true);
    setAllEmpty(state, surface);
    recomputeSubterraneanGates(adv(state));
    const revealed = revealTile(state, cavern.id);

    // First prompt is the bank (Blocked Field still present).
    expect(
      revealed.pendingChoice?.type === "OPTION_CHOICE" &&
        revealed.pendingChoice.context === "place-creature-bank",
      "bank is offered first"
    ).toBe(true);
    const bankChoice = revealed.pendingChoice!;
    const afterBank = applyOk(revealed, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: bankChoice.id,
      optionIndex: 1 // Leave it blocked — keep the Blocked Field for the gate test
    });

    // Then the gate exit pick opens.
    const gateChoice = gatePlacementChoice(afterBank);
    expect(gateChoice, "gate exit choice opens after the bank").toBeTruthy();
    const blockedHex = getTileFootprintSpaceIds(cavern).find(
      (id) => adv(afterBank).fields[id]?.location === "blocked_field"
    )!;
    const blockedIndex = gateChoice!.subterraneanGate!.candidates.findIndex((c) => c.hex === blockedHex);
    expect(blockedIndex, "the Blocked Field is a path-up candidate").toBeGreaterThanOrEqual(0);

    // Confirming the gate on the Blocked Field carves it (no bank re-offer).
    const afterGate = resolveGateChoice(afterBank, blockedIndex);
    expect(adv(afterGate).fields[blockedHex]!.location).toBe("subterranean_gate");
    expect(
      afterGate.pendingChoice?.type === "OPTION_CHOICE" &&
        afterGate.pendingChoice.context === "place-creature-bank",
      "bank is not re-offered after the gate"
    ).toBe(false);
  });

  it("via Subterranean Gate: Polish bank (type+size) is chosen BEFORE rotation, with Leave blocked", () => {
    // Real gate visit (not the test helper that skips beginTileRotation): the
    // cavern must reserve + offer banks before SET_TILE_ROTATION is legal.
    let state = createAdventureGameState({
      seed: "subt-gate-polish-bank-first",
      difficulty: "normal",
      rollFirstPlayer: false,
      chooseSubterraneanGate: false,
      creatureBanks: true,
      houseRules: { "polish-bank-sizes": true },
    });
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    const surfaceCenter = { row: 24, col: 12 };
    const cavernCenter = tileLatticeNeighbors(surfaceCenter)[0];
    const surface = instantiateTile(adv(state), "F1", surfaceCenter, 0, false);
    const cavern = instantiateTile(adv(state), "U1", cavernCenter, 0, true);
    setAllEmpty(state, surface);
    recomputeSubterraneanGates(adv(state));
    const gate = Object.values(adv(state).fields).find(
      (field) => field.location === "subterranean_gate" && field.gateToTileId === cavern.id
    );
    expect(gate, "surface gate toward the cavern").toBeTruthy();

    const hero = state.heroes.hero_p1;
    hero.spaceId = gate!.spaceId;
    hero.movementPoints = 3;
    // Real gate visit path (same as stepping onto the subterranean_gate field).
    beginFieldVisit(state, hero.id, gate!.spaceId, false);

    expect(adv(state).tiles[cavern.id].faceDown).toBe(false);
    expect(adv(state).tiles[cavern.id].awaitingRotation).toBe(true);
    // Bank choice is open BEFORE rotation — Polish candidates + Leave blocked.
    const choice = state.pendingChoice;
    expect(choice?.type === "OPTION_CHOICE" && choice.context === "place-creature-bank").toBe(true);
    if (choice?.type !== "OPTION_CHOICE" || choice.context !== "place-creature-bank") {
      throw new Error("expected pre-rotation bank choice");
    }
    expect(choice.creatureBank?.preRotation).toBe(true);
    expect(choice.creatureBank?.tier).toBe("near");
    expect((choice.creatureBank?.candidates?.length ?? 0) >= 1).toBe(true);
    expect(choice.options[choice.options.length - 1]?.label).toBe("Leave it blocked");
    // Rotation is NOT legal while the bank choice is open.
    expect(
      getLegalActions(state, "p1").some((legal) => legal.action.type === "SET_TILE_ROTATION")
    ).toBe(false);

    // Leave blocked, then rotate — field stays blocked, pile intact.
    const nearBefore = [...(adv(state).creatureBankTokensNear ?? [])];
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: choice.options.length - 1,
    });
    expect(adv(state).tiles[cavern.id].reservedBankDeclined).toBe(true);
    state = applyOk(state, {
      type: "SET_TILE_ROTATION",
      playerId: "p1",
      tileInstanceId: cavern.id,
      rotation: 0,
    });
    expect(
      getTileFootprintSpaceIds(cavern).some((id) => adv(state).fields[id]?.location === "creature_bank")
    ).toBe(false);
    expect(adv(state).creatureBankTokensNear).toEqual(nearBefore);
  });
});

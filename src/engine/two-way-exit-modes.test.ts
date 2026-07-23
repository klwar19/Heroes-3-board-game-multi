import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getTileFootprintSpaceIds,
  sanitizeCustomMapPreset,
  type CustomMapObject,
  type CustomMapTilePlan,
  type GameAction,
  type GameState,
  type MapSpaceId,
  type MapTileState
} from "./index";
import { carveColoredGateField, instantiateTile, placeMapToken } from "./adventure";
import type { AdventureState } from "./state";
import type { HexCoord } from "./hex";

// ---------------------------------------------------------------------------
// Two-way exit modes (certain / random / mix) — the AUDIT-fix pins:
//  1. a face-down designed gate/monolith token KEEPS its exit mode when the
//     reveal places it (placeMapToken parity with the face-up carve);
//  2. "mix" always-pickable works for a destination that is still a PENDING
//     token on a face-down tile (not only a carved field);
//  3. a STANDALONE gate object carries the same vocabulary as a tile token
//     (sanitizer keeps it; setup carves it onto the field).
// Each claim fails if its wiring is removed.
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

function refreshP1(state: GameState): GameState {
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    return applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  return state;
}

function makeGame(seed: string): GameState {
  const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false, creatureBanks: false });
  state.activePlayerId = "p1";
  return refreshP1(state);
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

function placeEmptyTile(state: GameState, tileDefId: string, center: HexCoord): [GameState, MapTileState] {
  const tile = instantiateTile(adv(state), tileDefId, center, 0, true);
  const revealed = revealTile(state, tile.id);
  setAllEmpty(revealed, adv(revealed).tiles[tile.id]);
  return [revealed, adv(revealed).tiles[tile.id]];
}

function carveGate(state: GameState, tile: MapTileState, slot: number, pair: 1 | 2 | 3 | 4): MapSpaceId {
  const spaceId = getTileFootprintSpaceIds(tile)[slot];
  const field = carveColoredGateField(adv(state), spaceId, pair);
  expect(field, `gate at slot ${slot}`).toBeTruthy();
  return spaceId;
}

function putHero(state: GameState, spaceId: MapSpaceId): void {
  const hero = state.heroes.hero_p1;
  hero.spaceId = spaceId;
  hero.movementPoints = 3;
  hero.movementHaltedThisTurn = false;
}

function moveHero(state: GameState, to: MapSpaceId): GameState {
  return applyOk(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to });
}

/** 2026-07-24 rule: commit to travel over "Stay here" (option 0 of the offer). */
function commitTravel(state: GameState, playerId = "p1"): GameState {
  if (adv(state).pendingVisit?.steps[0]?.type !== "CHOOSE_ONE") {
    return state;
  }
  return applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: 0 });
}

describe("face-down reveal keeps a designed token's two-way exit mode (placeMapToken parity)", () => {
  it("a pending GATE token's exitMode + alwaysPickable land on the carved field (CONTROL: a plain pending gate carves neither)", () => {
    let state = makeGame("exit-mode-facedown-gate");
    const [a, tile] = placeEmptyTile(state, "F1", { row: 24, col: 12 });
    state = a;
    adv(state).tiles[tile.id].pendingToken = {
      kind: "gate",
      pair: 2,
      exitMode: "random",
      alwaysPickable: true
    };
    const spaceId = getTileFootprintSpaceIds(tile)[3];
    placeMapToken(state, adv(state).tiles[tile.id], spaceId, "p1");
    const field = adv(state).fields[spaceId];
    expect(field?.location).toBe("gate");
    expect(field?.gatePair).toBe(2);
    expect(field?.onewayExitMode, "exit mode survives the face-down reveal").toBe("random");
    expect(field?.onewayAlwaysPickable, "always-pickable survives the face-down reveal").toBe(true);

    // CONTROL: a pending gate WITHOUT the extras carves a plain gate.
    let control = makeGame("exit-mode-facedown-gate-control");
    const [c, controlTile] = placeEmptyTile(control, "F1", { row: 24, col: 12 });
    control = c;
    adv(control).tiles[controlTile.id].pendingToken = { kind: "gate", pair: 2 };
    const controlSpace = getTileFootprintSpaceIds(controlTile)[3];
    placeMapToken(control, adv(control).tiles[controlTile.id], controlSpace, "p1");
    expect(adv(control).fields[controlSpace]?.onewayExitMode).toBeUndefined();
    expect(adv(control).fields[controlSpace]?.onewayAlwaysPickable).toBeUndefined();
  });

  it("a pending MONOLITH token's exitMode + alwaysPickable land on the carved field", () => {
    let state = makeGame("exit-mode-facedown-monolith");
    const [a, tile] = placeEmptyTile(state, "F1", { row: 24, col: 12 });
    state = a;
    adv(state).tiles[tile.id].pendingToken = {
      kind: "monolith",
      exitMode: "mix",
      alwaysPickable: true
    };
    const spaceId = getTileFootprintSpaceIds(tile)[2];
    placeMapToken(state, adv(state).tiles[tile.id], spaceId, "p1");
    const field = adv(state).fields[spaceId];
    expect(field?.location).toBe("monolith");
    expect(field?.onewayExitMode).toBe("mix");
    expect(field?.onewayAlwaysPickable).toBe(true);
  });
});

describe("mix-mode always-pickable covers PENDING (face-down) destinations", () => {
  it("a face-down pending gate token flagged alwaysPickable is offered up front — not folded into the roll (CONTROL: unflagged pending gate is roll-only)", () => {
    let state = makeGame("mix-pending-always");
    const [a, tileA] = placeEmptyTile(state, "F1", { row: 24, col: 12 });
    const [b, tileB] = placeEmptyTile(a, "F3", { row: 30, col: 18 });
    state = b;
    const entry = carveGate(state, tileA, 1, 1);
    const origin = adv(state).fields[entry];
    origin!.onewayExitMode = "mix";
    carveGate(state, tileB, 1, 1); // carved partner (NOT always-pickable → roll pool)
    // A pending red gate on a face-down tile, flagged always-pickable.
    const hidden = instantiateTile(adv(state), "N1", { row: 36, col: 24 }, 0, true);
    adv(state).tiles[hidden.id].pendingToken = { kind: "gate", pair: 1, alwaysPickable: true };
    putHero(state, getTileFootprintSpaceIds(tileA)[0]);

    state = moveHero(state, entry);
    // 2026-07-24 rule: mix defers its roll behind travel-vs-stay; commit to travel.
    state = commitTravel(state);

    const step = adv(state).pendingVisit?.steps[0];
    expect(step?.type).toBe("CHOOSE_ONE");
    if (step?.type !== "CHOOSE_ONE") {
      throw new Error("no mix-mode pick");
    }
    // One "always pickable" option (the PENDING tile) + one "Roll the die".
    const always = step.options.filter((option) => option.label.includes("always pickable"));
    expect(always, "the flagged pending destination is a free pick").toHaveLength(1);
    expect(always[0]!.label).toMatch(/face-down/);
    expect(step.options.some((option) => option.label.startsWith("Roll the die"))).toBe(true);

    // CONTROL: without the flag the pending tile joins the roll pool — no
    // always-pickable option at all, so mix degenerates to full random (no picker).
    let control = makeGame("mix-pending-always-control");
    const [ca, controlA] = placeEmptyTile(control, "F1", { row: 24, col: 12 });
    const [cb, controlB] = placeEmptyTile(ca, "F3", { row: 30, col: 18 });
    control = cb;
    const controlEntry = carveGate(control, controlA, 1, 1);
    adv(control).fields[controlEntry]!.onewayExitMode = "mix";
    carveGate(control, controlB, 1, 1);
    const controlHidden = instantiateTile(adv(control), "N1", { row: 36, col: 24 }, 0, true);
    adv(control).tiles[controlHidden.id].pendingToken = { kind: "gate", pair: 1 };
    putHero(control, getTileFootprintSpaceIds(controlA)[0]);
    control = moveHero(control, controlEntry);
    // The travel-vs-stay wrapper opens first (deferred roll); committing then
    // resolves the DEGENERATE random (no always-pickable) with no mix picker.
    control = commitTravel(control);
    const controlStep = adv(control).pendingVisit?.steps[0];
    expect(controlStep?.type === "CHOOSE_ONE").toBe(false);
  });
});

describe("standalone gate objects share the two-way exit-mode vocabulary", () => {
  const emptyPlan = (row: number, col: number): CustomMapTilePlan => ({
    group: "far",
    tileDefId: "F1",
    row,
    col,
    faceDown: false,
    rotation: 0
  });

  it("setup carves a standalone gate object's exitMode + alwaysPickable onto its field (CONTROL: a plain gate object carves neither)", () => {
    const objects: CustomMapObject[] = [
      { kind: "gate", pair: 3, placement: { type: "standalone", row: 22, col: 13 }, exitMode: "mix", alwaysPickable: true },
      { kind: "gate", pair: 3, placement: { type: "standalone", row: 22, col: 15 } }
    ];
    const state = createAdventureGameState({
      seed: "standalone-gate-exit-mode",
      difficulty: "normal",
      rollFirstPlayer: false,
      creatureBanks: false,
      customMap: [emptyPlan(24, 12), emptyPlan(24, 16)],
      customMapPreset: { objects }
    });
    const flagged = Object.values(state.adventure!.fields).find(
      (field) => field.location === "gate" && field.gatePair === 3 && field.onewayExitMode === "mix"
    );
    expect(flagged, "the standalone gate carries its exit mode").toBeTruthy();
    expect(flagged?.onewayAlwaysPickable).toBe(true);
    // CONTROL: the plain sibling carries neither.
    const plain = Object.values(state.adventure!.fields).find(
      (field) => field.location === "gate" && field.gatePair === 3 && field.spaceId !== flagged?.spaceId
    );
    expect(plain, "the plain standalone gate").toBeTruthy();
    expect(plain?.onewayExitMode).toBeUndefined();
    expect(plain?.onewayAlwaysPickable).toBeUndefined();
  });

  it("the preset sanitizer KEEPS a gate/monolith object's exit extras and DROPS them from a kind outside the vocabulary (tent)", () => {
    const objects: CustomMapObject[] = [
      { kind: "gate", pair: 1, placement: { type: "standalone", row: 22, col: 13 }, exitMode: "random", alwaysPickable: true },
      { kind: "monolith", placement: { type: "standalone", row: 22, col: 15 }, exitMode: "mix", alwaysPickable: true },
      {
        kind: "keymaster_tent",
        pair: 2,
        placement: { type: "standalone", row: 22, col: 17 },
        // Hand-edited junk a save could smuggle in — must be stripped.
        exitMode: "random",
        alwaysPickable: true
      } as CustomMapObject
    ];
    const sanitized = sanitizeCustomMapPreset({ objects })?.objects ?? [];
    expect(sanitized[0]).toMatchObject({ kind: "gate", exitMode: "random", alwaysPickable: true });
    expect(sanitized[1]).toMatchObject({ kind: "monolith", exitMode: "mix", alwaysPickable: true });
    expect(sanitized[2]?.kind).toBe("keymaster_tent");
    expect(sanitized[2]?.exitMode).toBeUndefined();
    expect(sanitized[2]?.alwaysPickable).toBeUndefined();
  });
});

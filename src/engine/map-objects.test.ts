import { describe, expect, it } from "vitest";
import {
  applyAction,
  canCrossEdge,
  createAdventureGameState,
  customMapPresetIsActive,
  describeCustomMapPresetEntries,
  describeMapObjects,
  getLegalActions,
  getPlayerView,
  getReachableHeroPaths,
  getTileFootprintSpaceIds,
  heroFieldSealedForDiscovery,
  isFieldGuarded,
  mapFieldLayer,
  MAX_GATES_PER_PAIR,
  sanitizeCustomMapObject,
  sanitizeCustomMapPreset,
  tileLatticeNeighbors,
  validateCustomMapObjects,
  type CustomMapObject,
  type CustomMapTilePlan,
  type GameAction,
  type GameState,
  type MapSpaceId,
  type MapTileState
} from "./index";
import { beginFieldVisit, carveColoredGateField, drawGuardArmy, eliminatePlayer, instantiateTile } from "./adventure";
import { startNeutralEncounter } from "./adventure-reducer";
import { canBeatGuardedField } from "./computer/map-navigation";
import { hexNeighbor, hexNeighbors, hexSpaceId, parseHexSpaceId, slotDirection, tileFootprint, type HexCoord } from "./hex";
import type { AdventureState } from "./state";

// ---------------------------------------------------------------------------
// Designer one-hex map objects: 4 colored Gate pairs (exact-pair routing,
// rulebook p.83), standalone hexes materialized OFF every tile, and a deliberate
// neutral guard on any object. Every test asserts the observable outcome (hero
// position, field/layer state, cross-edge, the note) so it fails if the wiring is
// removed — each with a divergent CONTROL.
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

/** Reveal a face-down tile through the real SET_TILE_ROTATION flow. */
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

/** A revealed, all-empty tile far from the seats, ready to carry an object. */
function placeEmptyTile(state: GameState, tileDefId: string, center: HexCoord): [GameState, MapTileState] {
  const tile = instantiateTile(adv(state), tileDefId, center, 0, true);
  const revealed = revealTile(state, tile.id);
  setAllEmpty(revealed, adv(revealed).tiles[tile.id]);
  return [revealed, adv(revealed).tiles[tile.id]];
}

/** Carve a colored Gate onto a tile's slot; optionally attach a designed guard. */
function carveGate(state: GameState, tile: MapTileState, slot: number, pair: 1 | 2 | 3 | 4, guard?: number): MapSpaceId {
  const spaceId = getTileFootprintSpaceIds(tile)[slot];
  const field = carveColoredGateField(adv(state), spaceId, pair);
  expect(field, `gate at slot ${slot}`).toBeTruthy();
  if (guard) {
    field!.difficulty = guard;
  }
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

const lastNote = (state: GameState): string =>
  [...state.eventLog].reverse().find((event) => event.type === "EVENT_NOTE")?.message ?? "";

// ===========================================================================
// 4. Colored Gate pair routing (exact-pair)
// ===========================================================================

describe("Colored Gate pair routing", () => {
  it("entering a red Gate teleports the hero to the OTHER red Gate — never the blue pair", () => {
    let state = makeGame("gate-pair");
    const [a, tileA] = placeEmptyTile(state, "F1", { row: 24, col: 12 });
    const [b, tileB] = placeEmptyTile(a, "F3", { row: 30, col: 18 });
    const [c, tileC] = placeEmptyTile(b, "F4", { row: 36, col: 24 });
    const [d, tileD] = placeEmptyTile(c, "F2", { row: 42, col: 30 });
    state = d;
    const redEntry = carveGate(state, tileA, 1, 1);
    // The red EXIT sits on the far tile (its hex sorts LAST); the blue pair sits
    // on the nearer tiles (their hexes sort FIRST). So if the same-pair routing
    // filter were dropped, the deterministic "first free gate" pick would land on
    // a BLUE gate — this test then fails, pinning the pair separation.
    const redExit = carveGate(state, tileD, 1, 1);
    const blueA = carveGate(state, tileB, 1, 2);
    const blueB = carveGate(state, tileC, 1, 2);
    putHero(state, getTileFootprintSpaceIds(tileA)[0]);

    state = moveHero(state, redEntry);

    // Straight to the OTHER red Gate — exactly its partner, no choice offered.
    expect(state.heroes.hero_p1.spaceId).toBe(redExit);
    expect(state.pendingChoice).toBeNull();
    expect(adv(state).pendingVisit).toBeNull();
    // CONTROL: never a blue gate.
    expect([blueA, blueB]).not.toContain(state.heroes.hero_p1.spaceId);
    // Arrival did not re-trigger (no ping-pong): the hero stayed on redExit.
    expect(state.heroes.hero_p1.spaceId).not.toBe(redEntry);
  });

  it("a hero on a Gate may Revisit (1 MP) to travel back to its pair partner", () => {
    let state = makeGame("gate-revisit");
    const [a, tileA] = placeEmptyTile(state, "F1", { row: 24, col: 12 });
    const [b, tileB] = placeEmptyTile(a, "F3", { row: 30, col: 18 });
    state = b;
    const entry = carveGate(state, tileA, 1, 3);
    const exit = carveGate(state, tileB, 1, 3);
    putHero(state, getTileFootprintSpaceIds(tileA)[0]);
    state = moveHero(state, entry);
    expect(state.heroes.hero_p1.spaceId).toBe(exit);
    const movementBefore = state.heroes.hero_p1.movementPoints;

    state = applyOk(state, { type: "REVISIT_FIELD", playerId: "p1", heroId: "hero_p1" });

    expect(state.heroes.hero_p1.spaceId).toBe(entry);
    expect(state.heroes.hero_p1.movementPoints).toBe(movementBefore - 1);
  });

  it("a Gate whose pair partner is occupied by a hero fizzles with a note", () => {
    let state = makeGame("gate-occupied");
    const [a, tileA] = placeEmptyTile(state, "F1", { row: 24, col: 12 });
    const [b, tileB] = placeEmptyTile(a, "F3", { row: 30, col: 18 });
    state = b;
    const entry = carveGate(state, tileA, 1, 1);
    const exit = carveGate(state, tileB, 1, 1);
    state.heroes.hero_p2.spaceId = exit; // the other seat squats on the partner
    putHero(state, getTileFootprintSpaceIds(tileA)[0]);

    state = moveHero(state, entry);

    expect(state.heroes.hero_p1.spaceId).toBe(entry);
    expect(lastNote(state)).toContain("occupied");
  });

  it("a lone Gate (only one of its pair placed) is inert with a note", () => {
    let state = makeGame("gate-lone");
    const [a, tileA] = placeEmptyTile(state, "F1", { row: 24, col: 12 });
    state = a;
    const entry = carveGate(state, tileA, 1, 4);
    putHero(state, getTileFootprintSpaceIds(tileA)[0]);

    state = moveHero(state, entry);

    expect(state.heroes.hero_p1.spaceId).toBe(entry);
    expect(lastNote(state).toLowerCase()).toContain("yellow"); // pair 4 = yellow
    expect(lastNote(state)).toContain("nowhere");
  });

  it("with THREE same-color gates the traveller PICKS among the two free partners (2 → automatic is the CONTROL above)", () => {
    let state = makeGame("gate-three-pick");
    const [a, tileA] = placeEmptyTile(state, "F1", { row: 24, col: 12 });
    const [b, tileB] = placeEmptyTile(a, "F3", { row: 30, col: 18 });
    const [c, tileC] = placeEmptyTile(b, "F4", { row: 36, col: 24 });
    state = c;
    const entry = carveGate(state, tileA, 1, 1);
    const exitB = carveGate(state, tileB, 1, 1);
    const exitC = carveGate(state, tileC, 1, 1);
    putHero(state, getTileFootprintSpaceIds(tileA)[0]);

    state = moveHero(state, entry);

    // A destination choice is open (a CHOOSE_ONE visit step) listing EXACTLY the
    // two free same-color partners — the same picker the Monolith network uses.
    const step = adv(state).pendingVisit?.steps[0];
    expect(step?.type).toBe("CHOOSE_ONE");
    if (step?.type !== "CHOOSE_ONE") {
      throw new Error("no gate destination choice");
    }
    expect(step.options).toHaveLength(2);
    // The picker is tagged for the board — kind "gate" AND the travelling color
    // pair (1 = red) — so each destination becomes a colored clickable exit hex;
    // dropping the tag fails here (mutation control).
    expect(step.teleport).toEqual({ kind: "gate", pair: 1 });
    const optionHexes = step.options.map((option) =>
      option.steps[0]?.type === "TELEPORT_HERO" ? option.steps[0].spaceId : null
    );
    expect(optionHexes).toContain(exitB);
    expect(optionHexes).toContain(exitC);
    // Masking CONTROL: a non-traveller seat sees no visit steps (no tag leaks).
    expect(getPlayerView(state, "p2").adventure?.pendingVisit?.steps ?? []).toEqual([]);
    state = applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 1 });
    expect([exitB, exitC]).toContain(state.heroes.hero_p1.spaceId);
    expect(exitB).not.toBe(exitC);
  });

  it("an occupied same-color partner is skipped — travel goes automatically to the one free gate", () => {
    let state = makeGame("gate-three-occupied");
    const [a, tileA] = placeEmptyTile(state, "F1", { row: 24, col: 12 });
    const [b, tileB] = placeEmptyTile(a, "F3", { row: 30, col: 18 });
    const [c, tileC] = placeEmptyTile(b, "F4", { row: 36, col: 24 });
    state = c;
    const entry = carveGate(state, tileA, 1, 1);
    const exitB = carveGate(state, tileB, 1, 1);
    const exitC = carveGate(state, tileC, 1, 1);
    // Squat on exitB → only exitC is free → automatic travel there (occupied
    // skipped, no pick opened). All-occupied → fizzle is the existing 2-gate CONTROL.
    state.heroes.hero_p2.spaceId = exitB;
    putHero(state, getTileFootprintSpaceIds(tileA)[0]);
    state = moveHero(state, entry);
    expect(state.heroes.hero_p1.spaceId).toBe(exitC);
    expect(state.pendingChoice).toBeNull();
    expect(adv(state).pendingVisit).toBeNull();
  });

  it("cross-group isolation: a red gate offers ONLY red gates — never blue gates or Monoliths (mutation control)", () => {
    let state = makeGame("gate-cross-group");
    const [a, tileA] = placeEmptyTile(state, "F1", { row: 24, col: 12 });
    const [b, tileB] = placeEmptyTile(a, "F3", { row: 30, col: 18 });
    const [c, tileC] = placeEmptyTile(b, "F4", { row: 36, col: 24 });
    state = c;
    // red×3
    const redEntry = carveGate(state, tileA, 1, 1);
    const red2 = carveGate(state, tileA, 2, 1);
    const red3 = carveGate(state, tileB, 1, 1);
    // blue×2
    const blue1 = carveGate(state, tileB, 2, 2);
    const blue2 = carveGate(state, tileC, 1, 2);
    // monolith×2 (set the location directly, as the lone-monolith CONTROL does)
    const mono1 = getTileFootprintSpaceIds(tileA)[3];
    adv(state).fields[mono1]!.location = "monolith";
    const mono2 = getTileFootprintSpaceIds(tileC)[2];
    adv(state).fields[mono2]!.location = "monolith";
    putHero(state, getTileFootprintSpaceIds(tileA)[0]);

    state = moveHero(state, redEntry);

    const step = adv(state).pendingVisit?.steps[0];
    expect(step?.type).toBe("CHOOSE_ONE");
    if (step?.type !== "CHOOSE_ONE") {
      throw new Error("no gate destination choice");
    }
    // EXACTLY the two other free RED gates — dropping the pair filter would offer
    // 4 gates (red+blue) or route to a Monolith, failing this length assertion.
    expect(step.options).toHaveLength(2);
    for (const optionIndex of [0, 1]) {
      const branch = applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex });
      expect([red2, red3]).toContain(branch.heroes.hero_p1.spaceId);
      expect([blue1, blue2, mono1, mono2]).not.toContain(branch.heroes.hero_p1.spaceId);
    }
  });

  it("cross-group isolation: a Monolith never travels to a Gate (2 monoliths + a red pair)", () => {
    let state = makeGame("mono-not-gate");
    const [a, tileA] = placeEmptyTile(state, "F1", { row: 24, col: 12 });
    const [b, tileB] = placeEmptyTile(a, "F3", { row: 30, col: 18 });
    state = b;
    const monoEntry = getTileFootprintSpaceIds(tileA)[1];
    adv(state).fields[monoEntry]!.location = "monolith";
    const monoExit = getTileFootprintSpaceIds(tileB)[1];
    adv(state).fields[monoExit]!.location = "monolith";
    const redA = carveGate(state, tileA, 2, 1);
    const redB = carveGate(state, tileB, 2, 1);
    putHero(state, getTileFootprintSpaceIds(tileA)[0]);

    state = moveHero(state, monoEntry);

    // Two Monoliths → straight to the OTHER Monolith, never a red gate.
    expect(state.heroes.hero_p1.spaceId).toBe(monoExit);
    expect([redA, redB]).not.toContain(state.heroes.hero_p1.spaceId);
  });

  it("CONTROL: Gates and Monoliths are SEPARATE networks — a Monolith never routes to a Gate", () => {
    let state = makeGame("gate-vs-monolith");
    const [a, tileA] = placeEmptyTile(state, "F1", { row: 24, col: 12 });
    const [b, tileB] = placeEmptyTile(a, "F3", { row: 30, col: 18 });
    const [c, tileC] = placeEmptyTile(b, "F4", { row: 36, col: 24 });
    state = c;
    // One Monolith on tileA, and a full red Gate pair on tileB/tileC.
    const monolith = getTileFootprintSpaceIds(tileA)[1];
    carveColoredGateField(adv(state), getTileFootprintSpaceIds(tileB)[1], 1); // red gate
    const redExit = getTileFootprintSpaceIds(tileB)[1];
    carveGate(state, tileC, 1, 1); // red gate partner
    // Carve a Monolith on tileA slot 1 (via the token carve).
    const mField = adv(state).fields[monolith]!;
    mField.location = "monolith";
    putHero(state, getTileFootprintSpaceIds(tileA)[0]);

    state = moveHero(state, monolith);

    // Only ONE Monolith on the map → it leads nowhere; it never jumps to a Gate.
    expect(state.heroes.hero_p1.spaceId).toBe(monolith);
    expect(state.heroes.hero_p1.spaceId).not.toBe(redExit);
    expect(lastNote(state)).toContain("Monolith");
  });
});

// ===========================================================================
// Colored Gate travel into a FACE-DOWN (pending) gate tile — parity with the
// Monolith network: a same-color gate token still riding a face-down tile is a
// full destination (flip free, rotate, place the token, arrive on it), NOT just
// a placeable that must first be carved by an unrelated discovery.
// ===========================================================================

describe("Colored Gate travel into a face-down (pending) gate tile", () => {
  it("the pick lists BOTH a carved partner AND a face-down pending gate — choosing the pending one flips it free, places the token, and the hero arrives on the carved gate", () => {
    let state = makeGame("gate-facedown-pick");
    const [a, tileA] = placeEmptyTile(state, "F1", { row: 24, col: 12 });
    const [b, tileB] = placeEmptyTile(a, "F3", { row: 30, col: 18 });
    state = b;
    const entry = carveGate(state, tileA, 1, 1); // red origin
    const carvedRed = carveGate(state, tileB, 1, 1); // carved red partner
    // A THIRD red gate still rides a face-down NEAR tile as a pending token.
    const hidden = instantiateTile(adv(state), "N1", { row: 36, col: 24 }, 0, true);
    adv(state).tiles[hidden.id].pendingToken = { kind: "gate", pair: 1 };
    putHero(state, getTileFootprintSpaceIds(tileA)[0]);

    state = moveHero(state, entry);

    // The pick lists BOTH the carved partner AND the face-down pending gate — the
    // same CHOOSE_ONE visit-step the Monolith network uses. Remove the pending
    // enumeration and only the carved partner remains → a size-1 automatic travel,
    // no picker → this length assertion fails.
    const step = adv(state).pendingVisit?.steps[0];
    expect(step?.type).toBe("CHOOSE_ONE");
    if (step?.type !== "CHOOSE_ONE") {
      throw new Error("no gate destination pick");
    }
    expect(step.options).toHaveLength(2);
    // Exactly ONE option is the face-down pending gate; the other is the carved
    // partner (a plain teleport).
    expect(step.options.filter((option) => option.label.includes("face-down"))).toHaveLength(1);
    const pendingIndex = step.options.findIndex((option) => option.label.includes("face-down"));

    // Choose the FACE-DOWN pending gate.
    state = applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: pendingIndex });

    // The face-down tile flipped for free, rotation handed to the traveller, the
    // in-flight gate travel parked awaiting the placement (carrying the pair).
    expect(adv(state).tiles[hidden.id].faceDown).toBe(false);
    expect(adv(state).pendingTokenTeleport?.destTileInstanceId).toBe(hidden.id);
    expect(adv(state).pendingTokenTeleport?.kind).toBe("gate");
    expect(adv(state).pendingTokenTeleport?.pair).toBe(1);
    state = revealTile(state, hidden.id);

    const choice = state.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE" || choice.context !== "place-map-token" || !choice.mapToken) {
      throw new Error("no gate token placement choice");
    }
    // The placement choice carries the gate kind AND its colored pair.
    expect(choice.mapToken.kind).toBe("gate");
    expect(choice.mapToken.pair).toBe(1);
    const pickedHex = choice.mapToken.candidates[0];
    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 0 });

    // The travel completed: the pending token carved a RED gate, the hero stands
    // on it, and the flight cleared.
    expect(adv(state).fields[pickedHex]?.location).toBe("gate");
    expect(adv(state).fields[pickedHex]?.gatePair).toBe(1);
    expect(state.heroes.hero_p1.spaceId).toBe(pickedHex);
    expect(adv(state).pendingTokenTeleport ?? null).toBeNull();
    // CONTROL: the hero did NOT just hop to the carved partner — the pending gate
    // was a real, chosen destination.
    expect(state.heroes.hero_p1.spaceId).not.toBe(carvedRed);
  });

  it("a lone carved gate plus a same-color pending token is a size-2 network — automatic travel (no picker) arms the reveal flow and completes on the placed gate", () => {
    let state = makeGame("gate-facedown-lone-pair");
    const [a, tileA] = placeEmptyTile(state, "F1", { row: 24, col: 12 });
    state = a;
    const entry = carveGate(state, tileA, 1, 2); // lone blue carved gate
    // Its ONLY partner still rides a face-down NEAR tile — the exact scenario
    // Task 4 left broken (the carved gate saw no carved partner → led nowhere).
    const hidden = instantiateTile(adv(state), "N1", { row: 30, col: 18 }, 0, true);
    adv(state).tiles[hidden.id].pendingToken = { kind: "gate", pair: 2 };
    putHero(state, getTileFootprintSpaceIds(tileA)[0]);

    state = moveHero(state, entry);

    // Exactly ONE destination (the pending tile) → automatic, no picker (the
    // MONOLITH convention: a lone pending member reveals straight through). The
    // immediate flip PROVES no picker was interposed.
    expect(adv(state).tiles[hidden.id].faceDown).toBe(false);
    expect(adv(state).pendingTileChoice?.tileInstanceId).toBe(hidden.id);
    expect(adv(state).pendingTokenTeleport?.destTileInstanceId).toBe(hidden.id);
    expect(adv(state).pendingTokenTeleport?.pair).toBe(2);
    // (Mutation control: remove the pending enumeration and this carved gate is a
    // lone gate → "leads nowhere", the tile never flips → the assertions above fail.)
    state = revealTile(state, hidden.id);

    const choice = state.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE" || choice.context !== "place-map-token" || !choice.mapToken) {
      throw new Error("no gate token placement choice");
    }
    const pickedHex = choice.mapToken.candidates[0];
    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 0 });

    expect(adv(state).fields[pickedHex]?.location).toBe("gate");
    expect(adv(state).fields[pickedHex]?.gatePair).toBe(2); // still blue
    expect(state.heroes.hero_p1.spaceId).toBe(pickedHex);
    expect(adv(state).pendingTokenTeleport ?? null).toBeNull();
  });

  it("isolation: a red gate never offers a pending BLUE gate or a pending Monolith — travel is automatic to the carved red partner, the foreign tiles stay face-down", () => {
    let state = makeGame("gate-facedown-isolation");
    const [a, tileA] = placeEmptyTile(state, "F1", { row: 24, col: 12 });
    const [b, tileB] = placeEmptyTile(a, "F3", { row: 30, col: 18 });
    state = b;
    const entry = carveGate(state, tileA, 1, 1); // red origin
    const redPartner = carveGate(state, tileB, 1, 1); // the ONLY red destination
    // A face-down BLUE gate token and a face-down MONOLITH token — neither may
    // ever join the RED network.
    const blueHidden = instantiateTile(adv(state), "N1", { row: 36, col: 24 }, 0, true);
    adv(state).tiles[blueHidden.id].pendingToken = { kind: "gate", pair: 2 };
    const monoHidden = instantiateTile(adv(state), "N2", { row: 42, col: 30 }, 0, true);
    adv(state).tiles[monoHidden.id].pendingToken = { kind: "monolith" };
    putHero(state, getTileFootprintSpaceIds(tileA)[0]);

    state = moveHero(state, entry);

    // ONE red destination only (the carved partner) → automatic travel there, no
    // picker. If the blue-gate or monolith pending tile leaked into the red set a
    // 2+ pick would open and the hero would stay on the entry hex.
    expect(state.heroes.hero_p1.spaceId).toBe(redPartner);
    expect(state.pendingChoice).toBeNull();
    expect(adv(state).pendingVisit).toBeNull();
    // The foreign pending tiles were untouched (never revealed).
    expect(adv(state).tiles[blueHidden.id].faceDown).toBe(true);
    expect(adv(state).tiles[monoHidden.id].faceDown).toBe(true);
    expect(adv(state).pendingTokenTeleport ?? null).toBeNull();
  });

  it("isolation: the Monolith network never offers a pending gate — a size-2 Monolith network travels automatically to its carved partner, the gate tile stays face-down", () => {
    let state = makeGame("mono-facedown-isolation");
    const [a, tileA] = placeEmptyTile(state, "F1", { row: 24, col: 12 });
    const [b, tileB] = placeEmptyTile(a, "F3", { row: 30, col: 18 });
    state = b;
    // Two carved Monoliths (set the location directly, as the routing CONTROLs do).
    const monoEntry = getTileFootprintSpaceIds(tileA)[1];
    adv(state).fields[monoEntry]!.location = "monolith";
    const monoExit = getTileFootprintSpaceIds(tileB)[1];
    adv(state).fields[monoExit]!.location = "monolith";
    // A face-down GATE token must NOT join the Monolith network.
    const gateHidden = instantiateTile(adv(state), "N1", { row: 36, col: 24 }, 0, true);
    adv(state).tiles[gateHidden.id].pendingToken = { kind: "gate", pair: 1 };
    putHero(state, getTileFootprintSpaceIds(tileA)[0]);

    state = moveHero(state, monoEntry);

    // Straight to the OTHER Monolith (a size-2 network), never the pending gate.
    expect(state.heroes.hero_p1.spaceId).toBe(monoExit);
    expect(state.pendingChoice).toBeNull();
    expect(adv(state).tiles[gateHidden.id].faceDown).toBe(true);
  });

  it("eliminating the traveller mid-flow auto-places the pending gate token (carved with its pair) and cancels the travel", () => {
    let state = makeGame("gate-facedown-elimination");
    const [a, tileA] = placeEmptyTile(state, "F1", { row: 24, col: 12 });
    state = a;
    const entry = carveGate(state, tileA, 1, 3); // green
    const hidden = instantiateTile(adv(state), "N1", { row: 30, col: 18 }, 0, true);
    adv(state).tiles[hidden.id].pendingToken = { kind: "gate", pair: 3 };
    putHero(state, getTileFootprintSpaceIds(tileA)[0]);

    state = moveHero(state, entry);
    // The travel armed and revealed; the placement choice is now open for p1.
    expect(adv(state).pendingTokenTeleport?.destTileInstanceId).toBe(hidden.id);
    state = revealTile(state, hidden.id);
    const choice = state.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE" || choice.context !== "place-map-token" || !choice.mapToken) {
      throw new Error("no gate token placement choice");
    }
    const autoHex = choice.mapToken.candidates[0];

    // p1 concedes WHILE owing the placement.
    eliminatePlayer(state, "p1", "conceded the game", true);

    // The token was auto-placed (carved GREEN gate with its pair) so it is not
    // stranded on the revealed tile; the dead seat's travel was cancelled.
    expect(adv(state).fields[autoHex]?.location).toBe("gate");
    expect(adv(state).fields[autoHex]?.gatePair).toBe(3);
    expect(adv(state).tiles[hidden.id].pendingToken).toBeUndefined();
    expect(adv(state).pendingTokenTeleport ?? null).toBeNull();
  });
});

// ===========================================================================
// 5. A guarded Gate: enter → battle → only a WIN teleports
// ===========================================================================

describe("guarded Gate — the battle gates the teleport", () => {
  function guardedPair(seed: string, guard: number, heroLevel: number): {
    state: GameState;
    entry: MapSpaceId;
    exit: MapSpaceId;
  } {
    let state = makeGame(seed);
    const [a, tileA] = placeEmptyTile(state, "F1", { row: 24, col: 12 });
    const [b, tileB] = placeEmptyTile(a, "F3", { row: 30, col: 18 });
    state = b;
    const entry = carveGate(state, tileA, 1, 1, guard);
    const exit = carveGate(state, tileB, 1, 1);
    state.heroes.hero_p1.level = heroLevel;
    putHero(state, getTileFootprintSpaceIds(tileA)[0]);
    return { state, entry, exit };
  }

  it("a level > difficulty WIN (Quick Combat) teleports to the partner AND clears the guard", () => {
    const { state: start, entry, exit } = guardedPair("gate-guard-win", 1, 2); // level 2 > difficulty 1
    let state = start;
    expect(isFieldGuarded(adv(state).fields[entry]!)).toBe(true);

    state = moveHero(state, entry);

    // A neutral win ran (Quick Combat), the teleport resolved, and the beaten
    // guard is GONE (the field no longer carries its Field Difficulty).
    expect(state.eventLog.some((event) => event.type === "QUICK_COMBAT_WON")).toBe(true);
    expect(state.heroes.hero_p1.spaceId).toBe(exit);
    expect(adv(state).fields[entry]?.difficulty).toBeUndefined();
    expect(isFieldGuarded(adv(state).fields[entry]!)).toBe(false);
  });

  it("a level ≤ difficulty entry OPENS the neutral battle and leaves the guard intact (no teleport yet)", () => {
    const { state: start, entry, exit } = guardedPair("gate-guard-battle", 2, 1); // level 1 ≤ difficulty 2
    let state = start;

    state = moveHero(state, entry);

    // The standard neutral battle opened at the designed difficulty…
    expect(state.combat, "a battle opened").toBeTruthy();
    expect(state.combat?.context.kind === "neutral" && state.combat.context.fieldId).toBe(entry);
    // …no teleport before the win, and the guard still stands.
    expect(state.heroes.hero_p1.spaceId).not.toBe(exit);
    expect(adv(state).fields[entry]?.difficulty).toBe(2);
    expect(isFieldGuarded(adv(state).fields[entry]!)).toBe(true);
  });

  it("RETREATING from the guard leaves it intact and never teleports (re-entry would fight again)", () => {
    const { state: start, entry, exit } = guardedPair("gate-guard-retreat", 2, 1);
    let state = start;
    startNeutralEncounter(state, state.heroes.hero_p1, adv(state).fields[entry]!);
    // Place, start, then run a harmless round (nobody dies) to the retreat window.
    const place = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
    state = applyOk(state, place!.action);
    state = applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
    state.combat!.dice.scriptedRolls = Array(80).fill(-1);
    for (const unit of Object.values(state.combat!.units)) {
      unit.attack = 0;
    }
    let safety = 120;
    while (state.combat && !state.combat.awaitingContinue && !state.combat.outcome && safety > 0) {
      safety -= 1;
      const actions = getLegalActions(state, "p1");
      const next =
        actions.find((legal) => legal.action.type === "DEFEND_UNIT") ??
        actions.find((legal) => legal.action.type === "PASS_REACTION") ??
        actions.find((legal) => legal.action.type === "CHOOSE_PENDING_ROLL") ??
        actions[0];
      if (!next) {
        break;
      }
      state = applyOk(state, next.action);
    }
    expect(state.combat?.awaitingContinue, "reached the continue-or-retreat window").toBe(true);

    state = applyOk(state, { type: "RETREAT_FROM_COMBAT", playerId: "p1" });

    // No teleport, and the guard is still on the gate for next time.
    expect(state.heroes.hero_p1.spaceId).not.toBe(exit);
    expect(adv(state).fields[entry]?.difficulty).toBe(2);
    expect(isFieldGuarded(adv(state).fields[entry]!)).toBe(true);
  });

  it("CONTROL: an UNGUARDED Gate teleports immediately with no battle", () => {
    const { state: start, entry, exit } = guardedPair("gate-unguarded", 0, 1); // guard 0 = none
    let state = start;
    expect(isFieldGuarded(adv(state).fields[entry]!)).toBe(false);

    state = moveHero(state, entry);

    expect(state.combat).toBeNull();
    expect(state.heroes.hero_p1.spaceId).toBe(exit);
  });

  it("a guarded Gate WIN resolves the NETWORK travel — the pick opens among the free same-color partners", () => {
    let state = makeGame("gate-guard-network");
    const [a, tileA] = placeEmptyTile(state, "F1", { row: 24, col: 12 });
    const [b, tileB] = placeEmptyTile(a, "F3", { row: 30, col: 18 });
    const [c, tileC] = placeEmptyTile(b, "F4", { row: 36, col: 24 });
    state = c;
    const entry = carveGate(state, tileA, 1, 1, 1); // guard difficulty 1
    const exitB = carveGate(state, tileB, 1, 1);
    const exitC = carveGate(state, tileC, 1, 1);
    state.heroes.hero_p1.level = 2; // level 2 > difficulty 1 → Quick Combat win
    putHero(state, getTileFootprintSpaceIds(tileA)[0]);

    state = moveHero(state, entry);

    // The guard fell (Quick Combat), THEN the gate network opened its pick.
    expect(state.eventLog.some((event) => event.type === "QUICK_COMBAT_WON")).toBe(true);
    const step = adv(state).pendingVisit?.steps[0];
    expect(step?.type).toBe("CHOOSE_ONE");
    if (step?.type !== "CHOOSE_ONE") {
      throw new Error("no gate pick after the win");
    }
    expect(step.options).toHaveLength(2);
    state = applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    expect([exitB, exitC]).toContain(state.heroes.hero_p1.spaceId);
    // The beaten guard is cleared on the entry field.
    expect(adv(state).fields[entry]?.difficulty).toBeUndefined();
  });
});

// ===========================================================================
// Setup path: standalone hexes, layers, tile-slot placement, AI, validation
// ===========================================================================

const CLUSTER = { row: 24, col: 12 };

/** The empty hex just OUTSIDE `slot`'s ring hex (distance 2 from centre). */
function outwardHex(center: HexCoord, slot: number): HexCoord {
  const ring = tileFootprint(center, 0)[slot];
  return hexNeighbor(ring, slotDirection(slot, 0) as number);
}

function objectsGame(customMap: CustomMapTilePlan[], objects: CustomMapObject[], seed = "map-objects"): GameState {
  return createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    creatureBanks: false,
    customMap,
    customMapPreset: { objects },
    players: [
      { id: "p1", name: "P1", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "P2", factionId: "necropolis", heroDefId: "sandro" }
    ]
  });
}

// ---- 1. Standalone materialization + reachability + view-safety --------------

describe("standalone object hexes", () => {
  it("materialize at setup as a real land field, reachable from an adjacent tile hex and back", () => {
    const standalone = outwardHex(CLUSTER, 1); // adjacent to F1's slot-1 ring hex (open outer edge)
    const state = objectsGame(
      [{ row: CLUSTER.row, col: CLUSTER.col, group: "far", faceDown: false, tileDefId: "F1" }],
      [{ kind: "monolith", placement: { type: "standalone", row: standalone.row, col: standalone.col } }]
    );
    const hex = hexSpaceId(standalone);
    const ring = hexSpaceId(tileFootprint(CLUSTER, 0)[1]);

    const field = adv(state).fields[hex];
    expect(field, "standalone field materialized").toBeTruthy();
    expect(field!.standalone).toBe(true);
    expect(field!.location).toBe("monolith");
    // Land (no water terrain), surface layer (only a surface tile touches it).
    expect(field!.terrain).toBeUndefined();
    expect(field!.standaloneLayer).toBe("surface");
    expect(mapFieldLayer(state, field)).toBe("surface");
    // A standalone hex has no tile seal, so a hero standing on it may discover an
    // adjacent face-down tile (decided OPEN, like any unsealed field).
    expect(heroFieldSealedForDiscovery(adv(state), field!)).toBe(false);

    // Crossable both ways between the tile ring hex and the standalone hex.
    expect(canCrossEdge(state, ring, hex)).toBe(true);
    expect(canCrossEdge(state, hex, ring)).toBe(true);

    // A hero standing on the ring hex can WALK onto the standalone (position moves).
    let walkState = refreshP1(state);
    const hero = walkState.heroes.hero_p1;
    hero.spaceId = ring;
    hero.movementPoints = 3;
    hero.movementHaltedThisTurn = false;
    expect(getReachableHeroPaths(walkState, hero).has(hex)).toBe(true);
    walkState = applyOk(walkState, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: hex });
    expect(walkState.heroes.hero_p1.spaceId).toBe(hex); // lone Monolith → stays put on it

    // Public: the standalone survives player-view masking (both seats).
    expect(getPlayerView(state, "p2").adventure!.fields[hex]?.standalone).toBe(true);
    expect(getPlayerView(state, "p1").adventure!.fields[hex]?.location).toBe("monolith");
  });

  it("a DETACHED standalone (touches no tile) materializes but is unreachable — no crash", () => {
    const detached = { row: CLUSTER.row, col: CLUSTER.col + 40 }; // far from every tile
    const state = objectsGame(
      [{ row: CLUSTER.row, col: CLUSTER.col, group: "far", faceDown: false, tileDefId: "F1" }],
      [{ kind: "monolith", placement: { type: "standalone", row: detached.row, col: detached.col } }]
    );
    const hex = hexSpaceId(detached);
    expect(adv(state).fields[hex], "detached field still materializes").toBeTruthy();
    // Every neighbour is empty of fields, so canCrossEdge is false in all
    // directions and never throws.
    for (const neighbor of hexNeighbors(detached)) {
      const nHex = hexSpaceId(neighbor);
      expect(canCrossEdge(state, hex, nHex)).toBe(false);
      expect(canCrossEdge(state, nHex, hex)).toBe(false);
    }
  });
});

// ---- 2. Layer rules ----------------------------------------------------------

describe("standalone layer rules", () => {
  it("a standalone touching an UNDERGROUND tile is subterranean; the layer divide holds in canCrossEdge", () => {
    // U1 slot 4 (spell_scroll) has an open outer edge; its outward hex touches
    // only the underground tile.
    const standalone = outwardHex(CLUSTER, 4);
    const state = objectsGame(
      [{ row: CLUSTER.row, col: CLUSTER.col, group: "subterranean", faceDown: false, tileDefId: "U1" }],
      [{ kind: "monolith", placement: { type: "standalone", row: standalone.row, col: standalone.col } }]
    );
    const hex = hexSpaceId(standalone);
    const undergroundRing = hexSpaceId(tileFootprint(CLUSTER, 0)[4]);
    const field = adv(state).fields[hex]!;
    expect(field.standaloneLayer).toBe("subterranean");
    expect(mapFieldLayer(state, field)).toBe("subterranean");

    // CONTROL: crossing FROM the underground tile hex works (same layer)…
    expect(canCrossEdge(state, undergroundRing, hex)).toBe(true);
    // …but a SURFACE field placed next to it cannot cross the divide.
    const surfaceNeighbor = hexNeighbors(standalone).find((n) => !adv(state).fields[hexSpaceId(n)])!;
    const surfaceHex = hexSpaceId(surfaceNeighbor);
    adv(state).fields[surfaceHex] = {
      spaceId: surfaceHex,
      tileInstanceId: "fake-surface",
      slot: 0,
      location: "empty_field",
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null,
      standalone: true,
      standaloneLayer: "surface"
    };
    expect(canCrossEdge(state, hex, surfaceHex)).toBe(false);
    expect(canCrossEdge(state, surfaceHex, hex)).toBe(false);
  });

  it("CONTROL: a standalone touching a SURFACE tile is surface", () => {
    const standalone = outwardHex(CLUSTER, 1);
    const state = objectsGame(
      [{ row: CLUSTER.row, col: CLUSTER.col, group: "far", faceDown: false, tileDefId: "F1" }],
      [{ kind: "gate", pair: 1, placement: { type: "standalone", row: standalone.row, col: standalone.col } }]
    );
    expect(adv(state).fields[hexSpaceId(standalone)]?.standaloneLayer).toBe("surface");
  });

  it("a standalone hex touching BOTH layers is REJECTED at validation with a problem", () => {
    const surface = CLUSTER;
    const underground = tileLatticeNeighbors(surface)[0]; // interlocks with the surface tile
    // A hex adjacent to BOTH footprints but inside neither.
    const both = findHexTouchingBoth(surface, underground);
    const plans: CustomMapTilePlan[] = [
      { row: surface.row, col: surface.col, group: "far", faceDown: false, tileDefId: "F1" },
      { row: underground.row, col: underground.col, group: "subterranean", faceDown: false, tileDefId: "U1" }
    ];
    const result = validateCustomMapObjects(plans, [
      { kind: "monolith", placement: { type: "standalone", row: both.row, col: both.col } }
    ]);
    expect(result.accepted).toHaveLength(0);
    expect(result.problems.join(" ")).toMatch(/both/i);
  });
});

function findHexTouchingBoth(a: HexCoord, b: HexCoord): HexCoord {
  const footA = new Set(tileFootprint(a, 0).map(hexSpaceId));
  const footB = new Set(tileFootprint(b, 0).map(hexSpaceId));
  for (let dRow = -3; dRow <= 3; dRow += 1) {
    for (let dCol = -3; dCol <= 3; dCol += 1) {
      const cand = { row: a.row + dRow, col: a.col + dCol };
      const id = hexSpaceId(cand);
      if (footA.has(id) || footB.has(id)) {
        continue;
      }
      const neighbors = hexNeighbors(cand).map(hexSpaceId);
      if (neighbors.some((n) => footA.has(n)) && neighbors.some((n) => footB.has(n))) {
        return cand;
      }
    }
  }
  throw new Error("no hex touching both tiles");
}

// ---- 3. Tile-slot gate replaces the hex like a token -------------------------

describe("tile-slot gate placement", () => {
  it("a tile-slot Gate replaces the hex (old location gone, gate present)", () => {
    const state = objectsGame(
      [{ row: CLUSTER.row, col: CLUSTER.col, group: "far", faceDown: false, tileDefId: "F1", rotation: 0 }],
      // F1 slot 0 is empty_field (a legal land slot); slot 3 (stables) is legal too.
      [{ kind: "gate", pair: 2, placement: { type: "tile-slot", row: CLUSTER.row, col: CLUSTER.col, slot: 0 } }]
    );
    const hex = hexSpaceId(tileFootprint(CLUSTER, 0)[0]);
    const field = adv(state).fields[hex]!;
    expect(field.location).toBe("gate");
    expect(field.gatePair).toBe(2);
    expect(field.standalone).toBeUndefined(); // rides the tile, not standalone
  });

  it("illegal tile-slot placements are dropped with problems (face-down plan, forbidden slot)", () => {
    const faceDownPlan: CustomMapTilePlan[] = [
      { row: CLUSTER.row, col: CLUSTER.col, group: "far", faceDown: true }
    ];
    const onFaceDown = validateCustomMapObjects(faceDownPlan, [
      { kind: "gate", pair: 1, placement: { type: "tile-slot", row: CLUSTER.row, col: CLUSTER.col, slot: 0 } }
    ]);
    expect(onFaceDown.accepted).toHaveLength(0);
    expect(onFaceDown.problems.join(" ")).toMatch(/face-up/i);

    // F1 slot 5 is a Blocked Field — never a legal object host.
    const faceUpPlan: CustomMapTilePlan[] = [
      { row: CLUSTER.row, col: CLUSTER.col, group: "far", faceDown: false, tileDefId: "F1" }
    ];
    const onBlocked = validateCustomMapObjects(faceUpPlan, [
      { kind: "gate", pair: 1, placement: { type: "tile-slot", row: CLUSTER.row, col: CLUSTER.col, slot: 5 } }
    ]);
    expect(onBlocked.accepted).toHaveLength(0);
    expect(onBlocked.problems.join(" ")).toMatch(/cannot host/i);
  });
});

// ---- 6. A guarded standalone monolith joins the monolith network -------------

describe("guard composes with the generic kind", () => {
  it("a guarded standalone Monolith teleports (after a win) to its partner Monolith", () => {
    const standalone = outwardHex(CLUSTER, 1);
    const state = objectsGame(
      [{ row: CLUSTER.row, col: CLUSTER.col, group: "far", faceDown: false, tileDefId: "F1" }],
      [
        { kind: "monolith", guard: 1, placement: { type: "standalone", row: standalone.row, col: standalone.col } },
        // A partner Monolith on the tile so the network has two.
        { kind: "monolith", placement: { type: "tile-slot", row: CLUSTER.row, col: CLUSTER.col, slot: 3 } }
      ]
    );
    const guardedHex = hexSpaceId(standalone);
    const partnerHex = hexSpaceId(tileFootprint(CLUSTER, 0)[3]);
    const guarded = adv(state).fields[guardedHex]!;
    expect(guarded.difficulty).toBe(1); // the designed guard is on the standalone
    expect(isFieldGuarded(guarded)).toBe(true);

    // A Quick-Combat WIN (level 2 > difficulty 1) clears the guard and the
    // Monolith network then teleports the hero to the partner.
    const hero = state.heroes.hero_p1;
    hero.level = 2;
    hero.spaceId = guardedHex;
    startNeutralEncounter(state, hero, guarded);

    expect(state.eventLog.some((event) => event.type === "QUICK_COMBAT_WON")).toBe(true);
    expect(hero.spaceId).toBe(partnerHex);
    expect(adv(state).fields[guardedHex]?.difficulty).toBeUndefined();
  });
});

// ---- 7. AI safety ------------------------------------------------------------

describe("computer AI treats object hexes as ordinary guarded fields", () => {
  it("canBeatGuardedField gates engagement on a guarded Gate by hero level (no crash)", () => {
    const state = objectsGame(
      [{ row: CLUSTER.row, col: CLUSTER.col, group: "far", faceDown: false, tileDefId: "F1" }],
      [{ kind: "gate", pair: 1, guard: 1, placement: { type: "tile-slot", row: CLUSTER.row, col: CLUSTER.col, slot: 0 } }]
    );
    const gateHex = hexSpaceId(tileFootprint(CLUSTER, 0)[0]);
    const gate = adv(state).fields[gateHex]!;
    expect(gate.location).toBe("gate");
    const hero = state.heroes.hero_p2;
    hero.level = 1;
    // A difficulty-1 Gate is beatable by a level-1 hero (>= engages)…
    expect(canBeatGuardedField(state, hero, gate)).toBe(true);
    // …but a difficulty-7 Gate is avoided.
    gate.difficulty = 7;
    expect(canBeatGuardedField(state, hero, gate)).toBe(false);
  });

  it("a single-player computer turn runs with objects (a guarded Gate + a Monolith) on the map — no stall/crash", async () => {
    const { driveComputerPlayers } = await import("../server/computer-runner");
    let state = createAdventureGameState({
      seed: "map-objects-ai",
      scenarioId: "skirmish",
      playerCount: 2,
      sessionMode: "single-player",
      creatureBanks: false,
      rollFirstPlayer: false // skip the opening home-tile rotation ceremony
    });
    // Turn two of the computer's reachable empty fields into a guarded red Gate
    // and a Monolith, so the AI's field enumeration meets object hexes this turn.
    const empties = Object.values(adv(state).fields).filter((f) => f.location === "empty_field");
    expect(empties.length).toBeGreaterThanOrEqual(2);
    Object.assign(empties[0], { location: "gate", gatePair: 1, difficulty: 1 });
    empties[1].location = "monolith";

    // Clear p1's mandatory start-of-turn draw, then end its turn → the computer
    // seat (p2) becomes active and the pump drives its whole turn.
    state = refreshP1(state);
    state = applyOk(state, { type: "END_TURN", playerId: "p1" });

    const run = driveComputerPlayers(state);
    expect(run.stalled, run.reason ?? "").toBe(false);
    expect(run.state.phase).not.toBe("game-over");
    // The pump actually drove the computer seat (it acted / the round wrapped),
    // so this is a real turn over object hexes, not a no-op false pass.
    expect(run.state.eventLog.length).toBeGreaterThan(state.eventLog.length);
  });
});

// ---- 8. Sanitization / validation / describe --------------------------------

describe("object sanitization + validation + describe", () => {
  it("round-trips a valid object set; a LEGACY number guard normalises to the {level} spec", () => {
    const objects: CustomMapObject[] = [
      { kind: "gate", pair: 1, placement: { type: "standalone", row: 5, col: 6 } },
      // Legacy saved shape: a plain number level.
      { kind: "gate", pair: 1, guard: 3, placement: { type: "tile-slot", row: 7, col: 8, slot: 2 } },
      { kind: "monolith", placement: { type: "standalone", row: 9, col: 10 } }
    ];
    const preset = sanitizeCustomMapPreset({ objects });
    expect(preset?.objects).toEqual([
      objects[0],
      // The number folds to the canonical CustomGuardSpec — same level, one shape.
      { ...objects[1], guard: { level: 3 } },
      objects[2]
    ]);
    expect(customMapPresetIsActive({ objects })).toBe(true);

    // The spec form round-trips unchanged (units clamped to known neutral ids).
    const specObjects: CustomMapObject[] = [
      {
        kind: "monolith",
        placement: { type: "standalone", row: 2, col: 2 },
        guard: { units: ["neutral.cyclopes"] }
      }
    ];
    expect(sanitizeCustomMapPreset({ objects: specObjects })?.objects).toEqual(specObjects);
  });

  it("caps the object count and the gates-per-pair, and drops garbage", () => {
    // 20 objects → capped at 16.
    const many = Array.from({ length: 20 }, (_, i) => ({
      kind: "monolith" as const,
      placement: { type: "standalone" as const, row: i, col: 0 }
    }));
    expect(sanitizeCustomMapPreset({ objects: many })?.objects).toHaveLength(16);

    // A colored gate is a per-color NETWORK (up to MAX_GATES_PER_PAIR = 8), not a
    // strict two-gate pair: 10 red gates → 8 survive, the 9th+ dropped in order.
    const manyRed = Array.from({ length: 10 }, (_, i) => ({
      kind: "gate" as const,
      pair: 1 as const,
      placement: { type: "tile-slot" as const, row: i, col: 0, slot: 0 }
    }));
    expect(sanitizeCustomMapPreset({ objects: manyRed })?.objects).toHaveLength(MAX_GATES_PER_PAIR);

    // Garbage: unknown kind, a gate with no pair, a bad placement → all dropped.
    expect(sanitizeCustomMapObject({ kind: "bogus", placement: { type: "standalone", row: 1, col: 1 } })).toBeNull();
    expect(sanitizeCustomMapObject({ kind: "gate", placement: { type: "standalone", row: 1, col: 1 } })).toBeNull();
    expect(sanitizeCustomMapObject({ kind: "monolith", placement: { type: "nope", row: 1, col: 1 } })).toBeNull();
    // A (legacy number) guard is clamped to 1-7 and normalised to the spec form.
    const clamped = sanitizeCustomMapObject({ kind: "monolith", guard: 99, placement: { type: "standalone", row: 1, col: 1 } });
    expect(clamped?.guard).toEqual({ level: 7 });
    // Unknown army ids are dropped; an emptied army guard vanishes entirely.
    const emptied = sanitizeCustomMapObject({
      kind: "monolith",
      guard: { units: ["not.a.unit"] },
      placement: { type: "standalone", row: 1, col: 1 }
    });
    expect(emptied?.guard).toBeUndefined();
  });

  it("reports geometry problems and an incomplete-pair warning; a standalone Whirlpool is refused", () => {
    const plans: CustomMapTilePlan[] = [
      { row: CLUSTER.row, col: CLUSTER.col, group: "far", faceDown: false, tileDefId: "F1" }
    ];
    // Inside the tile footprint, a standalone whirlpool, and a lone red gate.
    const inside = hexSpaceId(tileFootprint(CLUSTER, 0)[0]);
    const insideCoord = parseHexSpaceId(inside)!;
    const result = validateCustomMapObjects(plans, [
      { kind: "monolith", placement: { type: "standalone", row: insideCoord.row, col: insideCoord.col } },
      { kind: "whirlpool", placement: { type: "standalone", row: 100, col: 100 } },
      { kind: "gate", pair: 3, placement: { type: "tile-slot", row: CLUSTER.row, col: CLUSTER.col, slot: 3 } }
    ]);
    const problems = result.problems.join(" ");
    expect(problems).toMatch(/inside a tile|tile hex/i);
    expect(problems).toMatch(/standalone Whirlpool/i);
    // The lone green gate is accepted but WARNED as an incomplete pair.
    expect(result.accepted).toHaveLength(1);
    expect(result.warnings.join(" ")).toMatch(/green Gate pair/i);
  });

  it("gate warnings count ACROSS sources (plan tokens + objects): a token completes a lone object; over-8 warns", () => {
    // A lone gate OBJECT partnered with a plan gate TOKEN of the SAME color is a
    // complete network — NO lone warning (the cross-source count is what saves it).
    const pairedPlans: CustomMapTilePlan[] = [
      { row: CLUSTER.row, col: CLUSTER.col, group: "far", faceDown: false, tileDefId: "F1", token: { kind: "gate", pair: 1, slot: 0 } }
    ];
    const paired = validateCustomMapObjects(pairedPlans, [
      { kind: "gate", pair: 1, placement: { type: "standalone", row: CLUSTER.row - 4, col: CLUSTER.col } }
    ]);
    expect(paired.warnings.join(" ")).not.toMatch(/only one gate/i);

    // The SAME lone object with NO partner anywhere → the lone warning fires.
    const lone = validateCustomMapObjects(
      [{ row: CLUSTER.row, col: CLUSTER.col, group: "far", faceDown: false, tileDefId: "F1" }],
      [{ kind: "gate", pair: 2, placement: { type: "standalone", row: CLUSTER.row - 4, col: CLUSTER.col } }]
    );
    expect(lone.warnings.join(" ")).toMatch(/blue Gate pair/i);
    expect(lone.warnings.join(" ")).toMatch(/only one gate/i);

    // Over the per-color cap of 8 counted across BOTH sources (5 tokens + 5
    // objects = 10 of one color) → an over-cap warning naming the max.
    const overPlans: CustomMapTilePlan[] = Array.from({ length: 5 }, (_, i) => ({
      row: 60 + i,
      col: 60,
      group: "far" as const,
      faceDown: false,
      tileDefId: "F1",
      token: { kind: "gate" as const, pair: 3, slot: 0 }
    }));
    const overObjects: CustomMapObject[] = Array.from({ length: 5 }, (_, i) => ({
      kind: "gate" as const,
      pair: 3 as const,
      placement: { type: "standalone" as const, row: 80 + i, col: 80 }
    }));
    const over = validateCustomMapObjects(overPlans, overObjects);
    expect(over.warnings.join(" ")).toMatch(/at most 8/i);
  });

  it("describeMapObjects + preset entries summarise the objects", () => {
    const objects: CustomMapObject[] = [
      { kind: "gate", pair: 1, placement: { type: "standalone", row: 1, col: 1 } },
      { kind: "gate", pair: 1, placement: { type: "standalone", row: 2, col: 2 } },
      { kind: "gate", pair: 2, guard: 3, placement: { type: "standalone", row: 3, col: 3 } },
      { kind: "monolith", guard: 2, placement: { type: "standalone", row: 4, col: 4 } }
    ];
    const summary = describeMapObjects(objects);
    expect(summary).toContain("2 gate pairs");
    expect(summary).toContain("1 monolith");
    expect(summary).toContain("2 guarded");
    const entry = describeCustomMapPresetEntries({ objects }).find((e) => e.text.startsWith("Objects:"));
    expect(entry?.text).toContain("2 gate pairs");
  });
});

// ---- 8. Designer guards everywhere: exact armies, token guards, arrival auto-win

describe("designer guards on single hexes — exact armies + arrival auto-win", () => {
  it("an EXACT-ARMY object guard mints the designed units and is never Quick-Combat skipped (CONTROL: level guard is)", () => {
    const standalone = outwardHex(CLUSTER, 1);
    const state = objectsGame(
      [{ row: CLUSTER.row, col: CLUSTER.col, group: "far", faceDown: false, tileDefId: "F1" }],
      [
        {
          kind: "monolith",
          placement: { type: "standalone", row: standalone.row, col: standalone.col },
          guard: { units: ["neutral.cyclopes", "neutral.troglodytes"] }
        }
      ],
      "exact-army-object"
    );
    const hex = hexSpaceId(standalone);
    const field = adv(state).fields[hex]!;
    // Carve stamped the exact army + the tier-derived difficulty (gold 3 + bronze 1 → Ⅲ).
    expect(field.customGuardUnits).toEqual(["neutral.cyclopes", "neutral.troglodytes"]);
    expect(field.difficulty).toBe(3);
    expect(isFieldGuarded(field)).toBe(true);

    // The guard army for the fight is EXACTLY the designed units, minted
    // Creature-Bank style (never drawn from the tier decks).
    const draws = drawGuardArmy(state, field, field.difficulty!);
    expect(draws.map((draw) => draw.unitDefId)).toEqual(["neutral.cyclopes", "neutral.troglodytes"]);
    expect(draws.every((draw) => draw.bankGuard)).toBe(true);

    // A hero far above the derived difficulty still has to FIGHT.
    let fight = refreshP1(state);
    fight.heroes.hero_p1.level = 7;
    putHero(fight, hexSpaceId(tileFootprint(CLUSTER, 0)[1]));
    fight = moveHero(fight, hex);
    expect(fight.combat?.context.kind).toBe("neutral");
    expect(fight.eventLog.some((event) => event.type === "QUICK_COMBAT_WON")).toBe(false);

    // CONTROL: the same derived difficulty as a plain LEVEL guard IS skipped.
    const controlState = objectsGame(
      [{ row: CLUSTER.row, col: CLUSTER.col, group: "far", faceDown: false, tileDefId: "F1" }],
      [
        {
          kind: "monolith",
          placement: { type: "standalone", row: standalone.row, col: standalone.col },
          guard: { level: 3 }
        }
      ],
      "level-guard-object"
    );
    let control = refreshP1(controlState);
    control.heroes.hero_p1.level = 7;
    putHero(control, hexSpaceId(tileFootprint(CLUSTER, 0)[1]));
    control = moveHero(control, hex);
    expect(control.eventLog.some((event) => event.type === "QUICK_COMBAT_WON")).toBe(true);
    expect(control.combat).toBeNull();
  });

  it("a teleport ARRIVAL onto a still-guarded partner AUTO-WINS: guard cleared, no battle, hero arrives (CONTROL: walking on fights)", () => {
    let state = makeGame("arrival-auto-win");
    const [a, tileA] = placeEmptyTile(state, "F1", { row: 24, col: 12 });
    const [b, tileB] = placeEmptyTile(a, "F3", { row: 30, col: 18 });
    state = b;
    const entry = carveGate(state, tileA, 1, 1); // unguarded entry
    const exit = carveGate(state, tileB, 1, 1, 4); // guarded destination (level Ⅳ)
    state.heroes.hero_p1.level = 1;
    putHero(state, getTileFootprintSpaceIds(tileA)[0]);

    state = moveHero(state, entry);

    // The travel resolved: the hero ARRIVED on the guarded partner, the guard
    // was swept aside (auto-win) with NO battle and NO experience, and the note
    // says so.
    expect(state.heroes.hero_p1.spaceId).toBe(exit);
    expect(state.combat).toBeNull();
    expect(adv(state).fields[exit]?.difficulty).toBeUndefined();
    expect(isFieldGuarded(adv(state).fields[exit]!)).toBe(false);
    expect(state.heroes.hero_p1.level).toBe(1);
    expect(
      state.eventLog.some(
        (event) => event.type === "EVENT_NOTE" && /swept aside/i.test((event as { message?: string }).message ?? "")
      )
    ).toBe(true);

    // CONTROL: WALKING onto the same guarded gate from the map opens the battle.
    let walk = makeGame("arrival-auto-win-ctl");
    const [wa, wTileA] = placeEmptyTile(walk, "F1", { row: 24, col: 12 });
    walk = wa;
    const guarded = carveGate(walk, wTileA, 1, 1, 4);
    walk.heroes.hero_p1.level = 1;
    putHero(walk, getTileFootprintSpaceIds(wTileA)[0]);
    walk = moveHero(walk, guarded);
    expect(walk.combat?.context.kind).toBe("neutral");
    expect(isFieldGuarded(adv(walk).fields[guarded]!)).toBe(true);
  });

  it("a tile-plan TOKEN guard carves onto the token hex (face-up) and rides the pending token (face-down)", () => {
    // Face-up plan: the token guard is stamped at setup.
    const faceUp = objectsGame(
      [
        {
          row: CLUSTER.row,
          col: CLUSTER.col,
          group: "far",
          faceDown: false,
          tileDefId: "F1",
          tokens: [{ kind: "monolith", slot: 1, guard: { level: 5 } }]
        }
      ],
      [],
      "token-guard-faceup"
    );
    const tokenHex = hexSpaceId(tileFootprint(CLUSTER, 0)[1]);
    const carved = adv(faceUp).fields[tokenHex]!;
    expect(carved.location).toBe("monolith");
    expect(carved.difficulty).toBe(5);
    expect(isFieldGuarded(carved)).toBe(true);

    // Face-down plan: the guard rides the pending token, and stamps when placed.
    const faceDown = objectsGame(
      [
        {
          row: CLUSTER.row,
          col: CLUSTER.col,
          group: "far",
          faceDown: true,
          tokens: [{ kind: "monolith", slot: 1, guard: { units: ["neutral.cyclopes"] } }]
        }
      ],
      [],
      "token-guard-facedown"
    );
    const tile = Object.values(adv(faceDown).tiles).find(
      (candidate) => candidate.centerRow === CLUSTER.row && candidate.centerCol === CLUSTER.col
    )!;
    expect(tile.pendingTokens?.[0]?.guard).toEqual({ units: ["neutral.cyclopes"] });

    // CONTROL: an unguarded token plan stamps no difficulty.
    const control = objectsGame(
      [
        {
          row: CLUSTER.row,
          col: CLUSTER.col,
          group: "far",
          faceDown: false,
          tileDefId: "F1",
          tokens: [{ kind: "monolith", slot: 1 }]
        }
      ],
      [],
      "token-noguard"
    );
    expect(adv(control).fields[tokenHex]?.difficulty).toBeUndefined();
  });

  it("beating a guarded token clears its EXACT army too (no respawn on re-entry)", () => {
    const standalone = outwardHex(CLUSTER, 1);
    const state = objectsGame(
      [{ row: CLUSTER.row, col: CLUSTER.col, group: "far", faceDown: false, tileDefId: "F1" }],
      [
        {
          kind: "monolith",
          placement: { type: "standalone", row: standalone.row, col: standalone.col },
          guard: { units: ["neutral.troglodytes"] }
        }
      ],
      "guard-cleanup"
    );
    const hex = hexSpaceId(standalone);
    expect(adv(state).fields[hex]?.customGuardUnits).toEqual(["neutral.troglodytes"]);
    // Simulate the win seam directly: beginFieldVisit is reached only on a win.
    // (refreshP1 CLONES the state, so re-read the field from the clone.)
    const withHero = refreshP1(state);
    withHero.heroes.hero_p1.spaceId = hex;
    beginFieldVisit(withHero, "hero_p1", hex, false);
    const field = adv(withHero).fields[hex]!;
    expect(field.difficulty).toBeUndefined();
    expect(field.customGuardUnits).toBeUndefined();
    expect(isFieldGuarded(field)).toBe(false);
  });
});

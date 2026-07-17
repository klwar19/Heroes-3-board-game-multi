import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getTileFootprintSpaceIds,
  legalTokenSlotsForTileDef,
  type GameAction,
  type GameState,
  type MapSpaceId,
  type MapTileState
} from "./index";
import { ALL_TILE_CONTENT, allTileDefinitions } from "@/data/map/tiles";
import { carveMapTokenField, instantiateTile, placeMapToken } from "./adventure";
import type { AdventureState } from "./state";

// ---------------------------------------------------------------------------
// Monolith (Conflux) / Whirlpool (Cove) Location Tokens — rulebook p.35/83:
//   "Move your Hero to the corresponding Two-Way Monolith." / "Move your Hero
//   to another Whirlpool Token. If there are 3 Whirlpools, roll an Attack Die
//   … and reroll any Die that shows the number of the Whirlpool your Hero is
//   moving from. After each Whirlpool travel, lose 1 unit from your unit Deck."
//   Placement (p.35): a token on a face-down tile is placed, on discovery, on
//   "a Field of your choosing". At least 2 tokens of a kind are needed to work.
// Every test asserts the observable outcome (hero position, army size, field
// state) so it fails if the travel/penalty/placement logic is removed — with
// CONTROLs (a lone token, a Monolith travel for the unit toll) that diverge.
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

function makeGame(seed: string, options: { creatureBanks?: boolean } = {}): GameState {
  let state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    creatureBanks: options.creatureBanks ?? false
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

/**
 * A revealed, all-empty tile far from the seats, ready to carry a token. The
 * revealed-through-the-real-flow path keeps the tile fully materialized.
 */
function placeEmptyTile(state: GameState, tileDefId: string, center: { row: number; col: number }): [GameState, MapTileState] {
  const tile = instantiateTile(adv(state), tileDefId, center, 0, true);
  const revealed = revealTile(state, tile.id);
  setAllEmpty(revealed, adv(revealed).tiles[tile.id]);
  return [revealed, adv(revealed).tiles[tile.id]];
}

/** Carve a token onto the tile's ring slot and return the hex it sits on. */
function carveToken(
  state: GameState,
  tile: MapTileState,
  slot: number,
  kind: "monolith" | "whirlpool",
  number?: -1 | 0 | 1
): MapSpaceId {
  const spaceId = getTileFootprintSpaceIds(tile)[slot];
  const field = carveMapTokenField(adv(state), spaceId, kind, number);
  expect(field, `field at slot ${slot}`).toBeTruthy();
  return spaceId;
}

/** Parks the main hero on a hex with movement to spend. */
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

// --- Monolith travel --------------------------------------------------------

describe("Monolith travel", () => {
  it("entering one of two Monoliths teleports the hero to the other", () => {
    let state = makeGame("monolith-pair");
    const [afterA, tileA] = placeEmptyTile(state, "F1", { row: 24, col: 12 });
    const [afterB, tileB] = placeEmptyTile(afterA, "F3", { row: 30, col: 18 });
    state = afterB;
    const entry = carveToken(state, tileA, 1, "monolith");
    const exit = carveToken(state, tileB, 4, "monolith");
    putHero(state, getTileFootprintSpaceIds(tileA)[0]);

    state = moveHero(state, entry);

    // The observable outcome: the hero stands on the OTHER Monolith, having
    // paid only the 1 MP step onto the entry token.
    expect(state.heroes.hero_p1.spaceId).toBe(exit);
    expect(state.heroes.hero_p1.movementPoints).toBe(2);
    // Arrival must NOT re-trigger the destination token (no ping-pong): the
    // hero stays put with no pending interaction.
    expect(adv(state).pendingVisit).toBeNull();
    expect(state.pendingChoice).toBeNull();
  });

  it("CONTROL: a lone Monolith does nothing — and says at least 2 are needed", () => {
    let state = makeGame("monolith-lone");
    const [afterA, tileA] = placeEmptyTile(state, "F1", { row: 24, col: 12 });
    state = afterA;
    const entry = carveToken(state, tileA, 1, "monolith");
    putHero(state, getTileFootprintSpaceIds(tileA)[0]);

    state = moveHero(state, entry);

    expect(state.heroes.hero_p1.spaceId).toBe(entry);
    expect(lastNote(state)).toContain("at least 2");
  });

  it("with three Monoliths the traveller picks the destination", () => {
    let state = makeGame("monolith-pick");
    const [afterA, tileA] = placeEmptyTile(state, "F1", { row: 24, col: 12 });
    const [afterB, tileB] = placeEmptyTile(afterA, "F3", { row: 30, col: 18 });
    const [afterC, tileC] = placeEmptyTile(afterB, "F4", { row: 36, col: 24 });
    state = afterC;
    const entry = carveToken(state, tileA, 1, "monolith");
    const exitB = carveToken(state, tileB, 2, "monolith");
    const exitC = carveToken(state, tileC, 3, "monolith");
    putHero(state, getTileFootprintSpaceIds(tileA)[0]);

    state = moveHero(state, entry);

    // A destination choice is open (a CHOOSE_ONE visit step owned by p1).
    const step = adv(state).pendingVisit?.steps[0];
    expect(step?.type).toBe("CHOOSE_ONE");
    if (step?.type !== "CHOOSE_ONE") {
      throw new Error("no destination choice");
    }
    expect(step.options).toHaveLength(2);
    // Picking the second option lands the hero on that exact Monolith.
    state = applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 1 });
    expect([exitB, exitC]).toContain(state.heroes.hero_p1.spaceId);
    // Option order mirrors the destination list; the second is tile C's exit.
    expect(state.heroes.hero_p1.spaceId).toBe(exitC);
    expect(exitB).not.toBe(exitC);
  });

  it("a hero standing on a Monolith may Revisit (1 MP) to travel again", () => {
    let state = makeGame("monolith-revisit");
    const [afterA, tileA] = placeEmptyTile(state, "F1", { row: 24, col: 12 });
    const [afterB, tileB] = placeEmptyTile(afterA, "F3", { row: 30, col: 18 });
    state = afterB;
    const entry = carveToken(state, tileA, 1, "monolith");
    const exit = carveToken(state, tileB, 4, "monolith");
    putHero(state, getTileFootprintSpaceIds(tileA)[0]);
    state = moveHero(state, entry);
    expect(state.heroes.hero_p1.spaceId).toBe(exit);
    const movementBefore = state.heroes.hero_p1.movementPoints;

    state = applyOk(state, { type: "REVISIT_FIELD", playerId: "p1", heroId: "hero_p1" });

    // The revisit re-runs the travel: back to the first Monolith, 1 MP spent.
    expect(state.heroes.hero_p1.spaceId).toBe(entry);
    expect(state.heroes.hero_p1.movementPoints).toBe(movementBefore - 1);
  });

  it("a Monolith occupied by a hero is not a travel destination", () => {
    let state = makeGame("monolith-occupied");
    const [afterA, tileA] = placeEmptyTile(state, "F1", { row: 24, col: 12 });
    const [afterB, tileB] = placeEmptyTile(afterA, "F3", { row: 30, col: 18 });
    state = afterB;
    const entry = carveToken(state, tileA, 1, "monolith");
    const exit = carveToken(state, tileB, 4, "monolith");
    // The OTHER player's hero squats on the destination.
    state.heroes.hero_p2.spaceId = exit;
    putHero(state, getTileFootprintSpaceIds(tileA)[0]);

    state = moveHero(state, entry);

    // No destination is reachable: the hero stays (and the note explains).
    expect(state.heroes.hero_p1.spaceId).toBe(entry);
    expect(lastNote(state)).toContain("occupied");
  });
});

// --- Whirlpool travel and its unit toll --------------------------------------

describe("Whirlpool travel", () => {
  function whirlpoolPair(seed: string): { state: GameState; entry: MapSpaceId; exit: MapSpaceId } {
    let state = makeGame(seed);
    // W2's centre and most ring hexes are open sea (terrain water).
    const [afterA, tileA] = placeEmptyTile(state, "W2", { row: 24, col: 12 });
    const [afterB, tileB] = placeEmptyTile(afterA, "W4", { row: 30, col: 18 });
    state = afterB;
    const entry = carveToken(state, tileA, 3, "whirlpool", 1);
    const exit = carveToken(state, tileB, 3, "whirlpool", 0);
    // The hero sails in from the sea hex at the tile centre (sea→sea, no halt).
    putHero(state, getTileFootprintSpaceIds(tileA)[0]);
    return { state, entry, exit };
  }

  it("travelling costs 1 unit card of the traveller's choice; the card leaves the army", () => {
    const { state: start, exit } = whirlpoolPair("whirlpool-toll");
    let state = start;
    const armyBefore = state.players.p1.army.length;
    expect(armyBefore).toBeGreaterThan(1);
    const entryHex = Object.values(adv(state).fields).find((field) => field.location === "whirlpool" && field.whirlpoolNumber === 1)!.spaceId;

    state = moveHero(state, entryHex);

    // The hero surfaced at the other Whirlpool…
    expect(state.heroes.hero_p1.spaceId).toBe(exit);
    // …and the unit toll is a pending pick (more than one army card).
    const step = adv(state).pendingVisit?.steps[0];
    expect(step?.type).toBe("CHOOSE_ONE");
    const picked = state.players.p1.army[0];
    state = applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    expect(state.players.p1.army).toHaveLength(armyBefore - 1);
    expect(state.players.p1.army.some((unit) => unit.id === picked.id)).toBe(false);
  });

  it("a neutral-side casualty recycles to its tier discard pile", () => {
    const { state: start } = whirlpoolPair("whirlpool-neutral-recycle");
    let state = start;
    // Give the traveller a lone neutral-side card so the toll takes IT (no pick).
    state.players.p1.army = [{ id: "u_neutral_test", unitDefId: "neutral.rogues", side: "neutral" }];
    const bronzeDiscardBefore = state.decks["neutral-bronze"]?.discardPile.length ?? 0;
    const entryHex = Object.values(adv(state).fields).find((field) => field.location === "whirlpool" && field.whirlpoolNumber === 1)!.spaceId;

    state = moveHero(state, entryHex);

    expect(state.players.p1.army).toHaveLength(0);
    expect(state.decks["neutral-bronze"]?.discardPile.length ?? 0).toBe(bronzeDiscardBefore + 1);
    expect(state.decks["neutral-bronze"]?.discardPile.at(-1)).toBe("neutral.rogues");
  });

  it("CONTROL: a Monolith travel loses no unit", () => {
    let state = makeGame("monolith-no-toll");
    const [afterA, tileA] = placeEmptyTile(state, "F1", { row: 24, col: 12 });
    const [afterB, tileB] = placeEmptyTile(afterA, "F3", { row: 30, col: 18 });
    state = afterB;
    const entry = carveToken(state, tileA, 1, "monolith");
    carveToken(state, tileB, 4, "monolith");
    putHero(state, getTileFootprintSpaceIds(tileA)[0]);
    const armyBefore = state.players.p1.army.length;

    state = moveHero(state, entry);

    expect(adv(state).pendingVisit).toBeNull();
    expect(state.players.p1.army).toHaveLength(armyBefore);
  });

  it("with 3 numbered Whirlpools the Attack die picks where the hero surfaces (origin's number rerolled)", () => {
    let state = makeGame("whirlpool-die");
    const [afterA, tileA] = placeEmptyTile(state, "W2", { row: 24, col: 12 });
    const [afterB, tileB] = placeEmptyTile(afterA, "W4", { row: 30, col: 18 });
    const [afterC, tileC] = placeEmptyTile(afterB, "W5", { row: 36, col: 24 });
    state = afterC;
    const entry = carveToken(state, tileA, 3, "whirlpool", 1);
    const exitZero = carveToken(state, tileB, 3, "whirlpool", 0);
    const exitMinus = carveToken(state, tileC, 3, "whirlpool", -1);
    putHero(state, getTileFootprintSpaceIds(tileA)[0]);

    state = moveHero(state, entry);
    // Resolve the unit toll if it opened as a pick.
    if (adv(state).pendingVisit?.steps[0]?.type === "CHOOSE_ONE") {
      state = applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    }

    // The die decided — no destination choice was ever offered to the player…
    expect(state.eventLog.some((event) => event.type === "ADVENTURE_DICE_ROLLED" && event.dice === "attack")).toBe(true);
    const rollEvent = [...state.eventLog].reverse().find((event) => event.type === "ADVENTURE_DICE_ROLLED");
    const finalRoll = rollEvent?.type === "ADVENTURE_DICE_ROLLED" ? rollEvent.attackRolls?.at(-1) : undefined;
    // …the origin's own number (+1) was never kept…
    expect(finalRoll).not.toBe(1);
    // …and the hero surfaced at the Whirlpool whose number matches the kept die.
    const landed = state.heroes.hero_p1.spaceId;
    expect([exitZero, exitMinus]).toContain(landed);
    expect(adv(state).fields[landed as MapSpaceId]?.whirlpoolNumber).toBe(finalRoll);
  });
});

// --- Placement on discovery (face-down tiles) --------------------------------

describe("token placement on discovery", () => {
  it("automatically uses the designer's exact physical hex when it is legal after reveal", () => {
    let state = makeGame("token-place-reserved-hex");
    const tile = instantiateTile(adv(state), "N1", { row: 24, col: 12 }, 0, true);
    const preferredSlot = legalTokenSlotsForTileDef(allTileDefinitions.N1, "monolith")[0];
    const preferredSpaceId = getTileFootprintSpaceIds(tile)[preferredSlot];
    adv(state).tiles[tile.id].pendingToken = { kind: "monolith", preferredSpaceId };

    state = revealTile(state, tile.id);

    expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context === "place-map-token").toBe(false);
    expect(adv(state).fields[preferredSpaceId]?.location).toBe("monolith");
    expect(adv(state).tiles[tile.id].pendingToken).toBeUndefined();
  });

  it("falls back to the legal-field choice when random content blocks the reserved hex", () => {
    let state = makeGame("token-place-reserved-fallback");
    const tile = instantiateTile(adv(state), "N1", { row: 24, col: 12 }, 0, true);
    const legalSlots = new Set(legalTokenSlotsForTileDef(allTileDefinitions.N1, "monolith"));
    const blockedSlot = [0, 1, 2, 3, 4, 5, 6].find((slot) => !legalSlots.has(slot));
    expect(blockedSlot, "N1 has an incompatible field for the fallback control").toBeTypeOf("number");
    const preferredSpaceId = getTileFootprintSpaceIds(tile)[blockedSlot as number];
    adv(state).tiles[tile.id].pendingToken = { kind: "monolith", preferredSpaceId };

    state = revealTile(state, tile.id);

    const choice = state.pendingChoice;
    expect(choice?.type === "OPTION_CHOICE" && choice.context === "place-map-token").toBe(true);
    if (choice?.type !== "OPTION_CHOICE") {
      throw new Error("no fallback token choice");
    }
    expect(choice.prompt).toMatch(/reserved hex cannot host/i);
  });

  it("discovering a tile that carries a token lets the discoverer choose its field (terrain/blocked/guard/town excluded)", () => {
    let state = makeGame("token-place-walk");
    // N1: witch hut (guarded), windmill, sanctuary, mine (guarded), trading
    // post, tree of knowledge, blocked field.
    const tile = instantiateTile(adv(state), "N1", { row: 24, col: 12 }, 0, true);
    adv(state).tiles[tile.id].pendingToken = { kind: "monolith" };

    state = revealTile(state, tile.id);

    const choice = state.pendingChoice;
    expect(choice?.type).toBe("OPTION_CHOICE");
    if (choice?.type !== "OPTION_CHOICE" || choice.context !== "place-map-token" || !choice.mapToken) {
      throw new Error("no token placement choice");
    }
    expect(choice.playerId).toBe("p1");
    // Exactly the 4 legal fields: windmill, sanctuary, trading post, tree of
    // knowledge — never the guarded witch hut/mine or the blocked field.
    expect(choice.mapToken.candidates).toHaveLength(4);
    const candidateLocations = choice.mapToken.candidates.map((spaceId) => adv(state).fields[spaceId]?.location);
    expect(candidateLocations).not.toContain("blocked_field");
    expect(candidateLocations).not.toContain("mine");
    expect(candidateLocations).not.toContain("witch_hut");

    const pickedHex = choice.mapToken.candidates[2];
    const sacrificed = adv(state).fields[pickedHex]?.location;
    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 2 });

    // The token overwrote the chosen field and the tile's pending token is gone.
    expect(adv(state).fields[pickedHex]?.location).toBe("monolith");
    expect(adv(state).fields[pickedHex]?.location).not.toBe(sacrificed);
    expect(adv(state).tiles[tile.id].pendingToken).toBeUndefined();
    // A plain walking discovery moves no hero.
    expect(state.heroes.hero_p1.spaceId).not.toBe(pickedHex);
  });

  it("a whirlpool placement only offers sea fields", () => {
    let state = makeGame("token-place-sea");
    // W2 has two land islands (mystical garden, mine) among five sea hexes.
    const tile = instantiateTile(adv(state), "W2", { row: 24, col: 12 }, 0, true);
    adv(state).tiles[tile.id].pendingToken = { kind: "whirlpool", number: 1 };

    state = revealTile(state, tile.id);

    const choice = state.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE" || choice.context !== "place-map-token" || !choice.mapToken) {
      throw new Error("no token placement choice");
    }
    for (const spaceId of choice.mapToken.candidates) {
      expect(adv(state).fields[spaceId]?.terrain).toBe("water");
    }
    // The guarded sea chest is excluded even though it is water.
    const locations = choice.mapToken.candidates.map((spaceId) => adv(state).fields[spaceId]?.location);
    expect(locations).not.toContain("sea_chest");

    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 0 });
    const placed = Object.values(adv(state).fields).find((field) => field.location === "whirlpool");
    // The carved whirlpool keeps its printed number and stays open sea.
    expect(placed?.whirlpoolNumber).toBe(1);
    expect(placed?.terrain).toBe("water");
  });

  it("travelling to a reserved token on a face-down tile reveals it and arrives on the exact designed hex", () => {
    let state = makeGame("token-travel-reveal");
    const [afterA, tileA] = placeEmptyTile(state, "F1", { row: 24, col: 12 });
    state = afterA;
    const entry = carveToken(state, tileA, 1, "monolith");
    // The destination Monolith still rides a face-down NEAR tile.
    const hidden = instantiateTile(adv(state), "N1", { row: 30, col: 18 }, 0, true);
    const preferredSlot = legalTokenSlotsForTileDef(allTileDefinitions.N1, "monolith")[0];
    const preferredHex = getTileFootprintSpaceIds(hidden)[preferredSlot];
    adv(state).tiles[hidden.id].pendingToken = { kind: "monolith", preferredSpaceId: preferredHex };
    putHero(state, getTileFootprintSpaceIds(tileA)[0]);

    state = moveHero(state, entry);

    // The face-down tile flipped for free, rotation handed to the TRAVELLER.
    expect(adv(state).tiles[hidden.id].faceDown).toBe(false);
    expect(adv(state).pendingTileChoice?.tileInstanceId).toBe(hidden.id);
    expect(adv(state).pendingTileChoice?.playerId).toBe("p1");
    expect(adv(state).pendingTokenTeleport?.destTileInstanceId).toBe(hidden.id);
    state = revealTile(state, hidden.id);

    // Rotation locked → the traveller places the destination token.
    expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context === "place-map-token").toBe(false);
    // The travel completed automatically on the exact reserved hex.
    expect(adv(state).fields[preferredHex]?.location).toBe("monolith");
    expect(state.heroes.hero_p1.spaceId).toBe(preferredHex);
    expect(adv(state).pendingTokenTeleport ?? null).toBeNull();
  });

  it("travelling into a face-down Ⅱ–Ⅲ tile runs the standard keep/reroll flip before the placement", () => {
    let state = makeGame("token-travel-far-flip");
    const [afterA, tileA] = placeEmptyTile(state, "N2", { row: 24, col: 12 });
    state = afterA;
    const entry = carveToken(state, tileA, 1, "monolith");
    // The destination Monolith rides a face-down FAR tile — its reveal goes
    // through the same settlement/mine keep-reroll flip as any Ⅱ–Ⅲ discovery.
    const hidden = instantiateTile(adv(state), "F1", { row: 30, col: 18 }, 0, true);
    adv(state).tiles[hidden.id].pendingToken = { kind: "monolith" };
    putHero(state, getTileFootprintSpaceIds(tileA)[0]);

    state = moveHero(state, entry);

    // Any keep/reroll offers resolve by KEEPING (option 0) until the rotation
    // choice opens; the flip may retarget the same instance to another def.
    for (let guard = 0; guard < 6 && state.pendingChoice; guard += 1) {
      const choice = state.pendingChoice;
      if (choice.type !== "OPTION_CHOICE" || choice.context !== "far-tile-flip") {
        break;
      }
      state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 0 });
    }
    expect(adv(state).tiles[hidden.id].faceDown).toBe(false);
    expect(adv(state).pendingTileChoice?.tileInstanceId).toBe(hidden.id);
    for (const rotation of [0, 1, 2, 3, 4, 5]) {
      const result = applyAction(state, { type: "SET_TILE_ROTATION", playerId: "p1", tileInstanceId: hidden.id, rotation });
      if (result.errors.length === 0) {
        state = result.state;
        break;
      }
    }

    // The traveller places the token on the flipped tile and arrives on it.
    const choice = state.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE" || choice.context !== "place-map-token" || !choice.mapToken) {
      throw new Error("no token placement choice after the far-tile flip");
    }
    const pickedHex = choice.mapToken.candidates[0];
    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 0 });
    expect(adv(state).fields[pickedHex]?.location).toBe("monolith");
    expect(state.heroes.hero_p1.spaceId).toBe(pickedHex);
    expect(adv(state).pendingTokenTeleport ?? null).toBeNull();
  });

  it("a token still riding a face-down tile counts toward 'at least 2' (the lone-token CONTROL diverges)", () => {
    let state = makeGame("token-pending-counts");
    const [afterA, tileA] = placeEmptyTile(state, "F1", { row: 24, col: 12 });
    state = afterA;
    const entry = carveToken(state, tileA, 1, "monolith");
    const hidden = instantiateTile(adv(state), "N1", { row: 30, col: 18 }, 0, true);
    adv(state).tiles[hidden.id].pendingToken = { kind: "monolith" };
    putHero(state, getTileFootprintSpaceIds(tileA)[0]);

    state = moveHero(state, entry);

    // The travel STARTED (tile flipped) — the pending partner counted.
    expect(adv(state).tiles[hidden.id].faceDown).toBe(false);
  });

  it("a face-down GATE token reveals to a place-map-token choice carrying the pair; placing carves ONE gate", () => {
    let state = makeGame("gate-token-facedown");
    const tile = instantiateTile(adv(state), "N1", { row: 24, col: 12 }, 0, true);
    // A colored Gate token (pair 3 = green) rides the face-down tile.
    adv(state).tiles[tile.id].pendingToken = { kind: "gate", pair: 3 };

    state = revealTile(state, tile.id);

    const choice = state.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE" || choice.context !== "place-map-token" || !choice.mapToken) {
      throw new Error("no gate token placement choice");
    }
    // The choice carries the gate kind AND its colored pair through to placement.
    expect(choice.mapToken.kind).toBe("gate");
    expect(choice.mapToken.pair).toBe(3);
    const pickedHex = choice.mapToken.candidates[0];
    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 0 });

    // The gate was carved with its pair; exactly ONE gate field on the tile.
    expect(adv(state).fields[pickedHex]?.location).toBe("gate");
    expect(adv(state).fields[pickedHex]?.gatePair).toBe(3);
    const footprint = getTileFootprintSpaceIds(adv(state).tiles[tile.id]);
    expect(footprint.filter((id) => adv(state).fields[id]?.location === "gate")).toHaveLength(1);
    expect(adv(state).tiles[tile.id].pendingToken).toBeUndefined();
    // A plain walking discovery moves no hero.
    expect(state.heroes.hero_p1.spaceId).not.toBe(pickedHex);
  });

  it("placeMapToken carves a gate field with its pair (the single-candidate / elimination auto-place path)", () => {
    let state = makeGame("gate-place-direct");
    const tile = instantiateTile(adv(state), "F1", { row: 24, col: 12 }, 0, true);
    state = revealTile(state, tile.id);
    setAllEmpty(state, adv(state).tiles[tile.id]);
    const liveTile = adv(state).tiles[tile.id];
    liveTile.pendingToken = { kind: "gate", pair: 4 };
    const spaceId = getTileFootprintSpaceIds(liveTile)[0];

    // placeMapToken is the shared carve the lone-candidate AND elimination
    // auto-place both call — it must carve a GATE (not a monolith) with the pair.
    placeMapToken(state, liveTile, spaceId, "p1");

    expect(adv(state).fields[spaceId]?.location).toBe("gate");
    expect(adv(state).fields[spaceId]?.gatePair).toBe(4);
    expect(liveTile.pendingToken).toBeUndefined();
  });

  it("waits behind the Creature Bank offer on the same tile", () => {
    let state = makeGame("token-after-bank", { creatureBanks: true });
    const tile = instantiateTile(adv(state), "N1", { row: 24, col: 12 }, 0, true);
    adv(state).tiles[tile.id].pendingToken = { kind: "monolith" };

    state = revealTile(state, tile.id);

    // N1 has a Blocked Field, so the bank offer opens first…
    const bank = state.pendingChoice;
    if (bank?.type !== "OPTION_CHOICE" || bank.context !== "place-creature-bank") {
      throw new Error("no creature bank offer");
    }
    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: bank.id, optionIndex: 1 });

    // …and resolving it (either way) opens the token placement next.
    const token = state.pendingChoice;
    expect(token?.type === "OPTION_CHOICE" && token.context === "place-map-token").toBe(true);
  });
});

// --- Setup: the map designer's plans ------------------------------------------

describe("designed map tokens at setup", () => {
  it("carves a face-up plan's token at its designed slot and parks a face-down plan's token on the tile", () => {
    const state = createAdventureGameState({
      seed: "designed-tokens",
      creatureBanks: false,
      customMap: [
        // Face-up F1 with a Monolith on its empty centre field (slot 0).
        { row: 24, col: 12, group: "far", faceDown: false, tileDefId: "F1", rotation: 0, token: { kind: "monolith", slot: 0 } },
        // Face-down near tile with its Monolith reserved on physical slot 2.
        { row: 30, col: 18, group: "near", faceDown: true, token: { kind: "monolith", slot: 2 } }
      ]
    });

    const faceUp = Object.values(state.adventure!.tiles).find((tile) => tile.tileDefId === "F1")!;
    const centerHex = getTileFootprintSpaceIds(faceUp)[0];
    expect(state.adventure!.fields[centerHex]?.location).toBe("monolith");

    const faceDown = Object.values(state.adventure!.tiles).find((tile) => tile.faceDown && tile.group === "near")!;
    expect(faceDown.pendingToken).toEqual({
      kind: "monolith",
      preferredSpaceId: getTileFootprintSpaceIds(faceDown)[2]
    });
  });

  it("carves a face-up GATE token at its slot (ONE hex is the gate, the tile's other six untouched)", () => {
    const state = createAdventureGameState({
      seed: "designed-gate-token-setup",
      creatureBanks: false,
      customMap: [
        // Face-up F1 with a colored Gate (pair 2 = blue) on its empty centre (slot 0).
        { row: 24, col: 12, group: "far", faceDown: false, tileDefId: "F1", rotation: 0, token: { kind: "gate", pair: 2, slot: 0 } }
      ]
    });

    const tile = Object.values(state.adventure!.tiles).find((candidate) => candidate.tileDefId === "F1")!;
    const footprint = getTileFootprintSpaceIds(tile);
    expect(state.adventure!.fields[footprint[0]]?.location).toBe("gate");
    expect(state.adventure!.fields[footprint[0]]?.gatePair).toBe(2);
    // "One hex, one effect": exactly one gate field; the other six keep their
    // printed content (never a duplicate gate).
    expect(footprint.filter((id) => state.adventure!.fields[id]?.location === "gate")).toHaveLength(1);
    for (let index = 1; index < footprint.length; index += 1) {
      expect(state.adventure!.fields[footprint[index]]?.location).not.toBe("gate");
    }
  });

  it("parks a face-down plan's GATE token on the tile (pending, pair kept)", () => {
    const state = createAdventureGameState({
      seed: "designed-gate-facedown",
      creatureBanks: false,
      customMap: [{ row: 30, col: 18, group: "near", faceDown: true, token: { kind: "gate", pair: 1 } }]
    });
    const faceDown = Object.values(state.adventure!.tiles).find((tile) => tile.faceDown && tile.group === "near")!;
    expect(faceDown.pendingToken).toEqual({ kind: "gate", pair: 1 });
  });

  it("numbers designed whirlpools +1, 0, -1 in plan order (the printed die faces)", () => {
    // Sea tiles ship in the Cove expansion, so the sea pool needs its content
    // on; the three slots sit far from the seats (free-form placement).
    const centers = [
      { row: 24, col: 12 },
      { row: 30, col: 18 },
      { row: 36, col: 24 }
    ];
    const state = createAdventureGameState({
      seed: "designed-whirlpools",
      creatureBanks: false,
      tileContent: ALL_TILE_CONTENT,
      customMap: centers.map((center) => ({
        row: center.row,
        col: center.col,
        group: "sea" as const,
        faceDown: true,
        token: { kind: "whirlpool" as const }
      }))
    });

    const whirlpoolTiles = Object.values(state.adventure!.tiles).filter(
      (tile) => tile.pendingToken?.kind === "whirlpool"
    );
    expect(whirlpoolTiles).toHaveLength(3);
    const numbers = whirlpoolTiles.map((tile) => tile.pendingToken!.number);
    expect([...numbers].sort((a, b) => (a ?? 9) - (b ?? 9))).toEqual([-1, 0, 1]);
  });

  it("drops a face-up token on an illegal slot (hand-edited save) instead of carving it", () => {
    const state = createAdventureGameState({
      seed: "designed-token-illegal",
      creatureBanks: false,
      customMap: [
        // Slot 5 of F1 is the Blocked Field — never a legal token host.
        { row: 24, col: 12, group: "far", faceDown: false, tileDefId: "F1", rotation: 0, token: { kind: "monolith", slot: 5 } }
      ]
    });

    expect(Object.values(state.adventure!.fields).some((field) => field.location === "monolith")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Multi-token tiles — a tile may queue SEVERAL tokens (pendingTokens); every
// one must place on reveal, each on its own hex. The queue drain is what these
// pin: before it existed, only the singular head placed and the rest leaked as
// stale state (never offered again).
// ---------------------------------------------------------------------------

describe("multi-token tiles (pendingTokens queue)", () => {
  it("a reveal places EVERY queued token on its reserved hex and clears the queue", () => {
    const state = makeGame("multi-token-drain");
    const tile = instantiateTile(adv(state), "F1", { row: 24, col: 12 }, 0, true);
    const footprint = getTileFootprintSpaceIds(tile);
    tile.pendingTokens = [
      { kind: "monolith", preferredSpaceId: footprint[1] },
      { kind: "gate", pair: 1, preferredSpaceId: footprint[2] }
    ];
    tile.pendingToken = tile.pendingTokens[0];

    let revealed = revealTile(state, tile.id);
    // A reserved hex the random printed art made illegal falls back to the
    // normal pick-a-field choice — answer each with its first offer. The drain
    // re-offers the NEXT queued token after every resolution.
    for (let guard = 0; guard < 8 && revealed.pendingChoice; guard += 1) {
      revealed = applyOk(revealed, {
        type: "CHOOSE_OPTION",
        playerId: "p1",
        choiceId: revealed.pendingChoice.id,
        optionIndex: 0
      });
    }

    const after = adv(revealed);
    const fields = footprint.map((spaceId) => after.fields[spaceId]?.location);
    expect(fields.filter((location) => location === "monolith")).toHaveLength(1);
    expect(fields.filter((location) => location === "gate")).toHaveLength(1);
    // The queue drained — no stale entries survive (the pre-fix leak).
    expect(after.tiles[tile.id].pendingTokens).toBeUndefined();
    expect(after.tiles[tile.id].pendingToken).toBeUndefined();
  });

  it("CONTROL: a single-token tile still places exactly one and stays clean", () => {
    const state = makeGame("multi-token-single");
    const tile = instantiateTile(adv(state), "F1", { row: 24, col: 12 }, 0, true);
    const footprint = getTileFootprintSpaceIds(tile);
    tile.pendingTokens = [{ kind: "monolith", preferredSpaceId: footprint[1] }];
    tile.pendingToken = tile.pendingTokens[0];

    const revealed = revealTile(state, tile.id);
    const after = adv(revealed);
    const monoliths = footprint.filter((spaceId) => after.fields[spaceId]?.location === "monolith");
    expect(monoliths.length).toBeLessThanOrEqual(1);
    expect(after.tiles[tile.id].pendingTokens).toBeUndefined();
  });
});

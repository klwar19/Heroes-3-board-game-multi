import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  getTileFootprintSpaceIds,
  NEUTRAL_PLAYER_ID,
  type GameAction,
  type GameState,
  type MapSpaceId,
  type MapTileState,
} from "./index";
import { carveMapTokenField, carveOnewayField, instantiateTile } from "./adventure";
import { finalizeAdventureCombat } from "./adventure-reducer";
import { finishCombatIfNeeded } from "./combat-units";
import { observeForComputer } from "./computer/observation";
import { chooseComputerAction } from "./computer/policy";
import type { AdventureState } from "./state";

// ---------------------------------------------------------------------------
// 2026-07-24 user rule for teleporters (Monolith / Teleport Gate / Whirlpool /
// one-way monolith). Every entry (or Revisit) now offers "travel vs stay"; a
// teleport ARRIVAL onto a guarded destination FIGHTS the guard (no auto-sweep),
// and an enemy-occupied destination starts a PvP battle. Each test asserts the
// observable outcome (hero position, combat, guard state) with a CONTROL.
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
    if (!field) continue;
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
    if (result.errors.length === 0) return result.state;
  }
  throw new Error(`no legal rotation revealed ${tileId}`);
}

function placeEmptyTile(state: GameState, tileDefId: string, center: { row: number; col: number }): [GameState, MapTileState] {
  const tile = instantiateTile(adv(state), tileDefId, center, 0, true);
  const revealed = revealTile(state, tile.id);
  setAllEmpty(revealed, adv(revealed).tiles[tile.id]);
  return [revealed, adv(revealed).tiles[tile.id]];
}

function carveToken(state: GameState, tile: MapTileState, slot: number, kind: "monolith" | "whirlpool", guard?: number): MapSpaceId {
  const spaceId = getTileFootprintSpaceIds(tile)[slot];
  const field = carveMapTokenField(adv(state), spaceId, kind);
  expect(field, `field at slot ${slot}`).toBeTruthy();
  if (guard) field!.difficulty = guard;
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

function commitTravel(state: GameState): GameState {
  expect(adv(state).pendingVisit?.steps[0]?.type, "expected a travel-vs-stay offer").toBe("CHOOSE_ONE");
  return applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
}

/** Pick the LAST option of the open travel offer (always "Stay here"). */
function chooseStay(state: GameState): GameState {
  const step = adv(state).pendingVisit?.steps[0];
  if (step?.type !== "CHOOSE_ONE") throw new Error("no travel offer to stay on");
  expect(step.options[step.options.length - 1].label).toContain("Stay");
  return applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: step.options.length - 1 });
}

// --- Stay here + Revisit-to-travel ------------------------------------------

describe("Stay here + Revisit", () => {
  it("choosing Stay leaves the hero on the teleporter; a later Revisit (1 MP) re-opens the offer and travels", () => {
    let state = makeGame("stay-then-revisit");
    const [afterA, tileA] = placeEmptyTile(state, "F1", { row: 24, col: 12 });
    const [afterB, tileB] = placeEmptyTile(afterA, "F3", { row: 30, col: 18 });
    state = afterB;
    const entry = carveToken(state, tileA, 1, "monolith");
    const exit = carveToken(state, tileB, 4, "monolith");
    putHero(state, getTileFootprintSpaceIds(tileA)[0]);

    state = moveHero(state, entry);
    const mpAfterStep = state.heroes.hero_p1.movementPoints;

    // Stay: the hero remains on the entry token, nothing else consumed.
    state = chooseStay(state);
    expect(state.heroes.hero_p1.spaceId).toBe(entry);
    expect(adv(state).pendingVisit).toBeNull();
    expect(state.heroes.hero_p1.movementPoints).toBe(mpAfterStep);

    // A later Revisit (exactly 1 MP) re-opens the SAME offer; committing travels.
    state = applyOk(state, { type: "REVISIT_FIELD", playerId: "p1", heroId: "hero_p1" });
    expect(adv(state).pendingVisit?.steps[0]?.type).toBe("CHOOSE_ONE");
    state = commitTravel(state);
    expect(state.heroes.hero_p1.spaceId).toBe(exit);
    expect(state.heroes.hero_p1.movementPoints).toBe(mpAfterStep - 1); // only the Revisit's 1 MP
  });

  it("a Whirlpool offers Stay; travelling keeps the die/number flow AND the unit toll", () => {
    let state = makeGame("whirlpool-stay");
    const [afterA, tileA] = placeEmptyTile(state, "W2", { row: 24, col: 12 });
    const [afterB, tileB] = placeEmptyTile(afterA, "W4", { row: 30, col: 18 });
    state = afterB;
    const entry = carveToken(state, tileA, 3, "whirlpool");
    adv(state).fields[entry]!.whirlpoolNumber = 1;
    const exit = carveToken(state, tileB, 3, "whirlpool");
    adv(state).fields[exit]!.whirlpoolNumber = 0;
    putHero(state, getTileFootprintSpaceIds(tileA)[0]);

    // Stay branch: no travel, no toll.
    let stay = moveHero(state, entry);
    const armyBefore = stay.players.p1.army.length;
    stay = chooseStay(stay);
    expect(stay.heroes.hero_p1.spaceId).toBe(entry);
    expect(stay.players.p1.army).toHaveLength(armyBefore);

    // Travel branch: committing runs the travel + the unit toll (army > 1 → pick).
    let go = moveHero(state, entry);
    go = commitTravel(go);
    expect(go.heroes.hero_p1.spaceId).toBe(exit);
    // The unit toll opened as a pick (the whirlpool flow is preserved).
    expect(go.adventure?.pendingVisit?.steps[0]?.type).toBe("CHOOSE_ONE");
    go = applyOk(go, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    expect(go.players.p1.army).toHaveLength(armyBefore - 1);
  });

  it("a one-way entrance offers Stay; a one-way EXIT stays inert (standing on it offers no travel)", () => {
    let state = makeGame("oneway-stay");
    const [afterA, tileA] = placeEmptyTile(state, "F1", { row: 24, col: 12 });
    const [afterB, tileB] = placeEmptyTile(afterA, "F3", { row: 30, col: 18 });
    state = afterB;
    const entryHex = getTileFootprintSpaceIds(tileA)[1];
    carveOnewayField(adv(state), entryHex, "oneway_entrance", 1);
    const exitHex = getTileFootprintSpaceIds(tileB)[1];
    carveOnewayField(adv(state), exitHex, "oneway_exit", 1);
    putHero(state, getTileFootprintSpaceIds(tileA)[0]);

    // The entrance offers travel-vs-stay; staying keeps the hero at the entrance.
    let stay = moveHero(state, entryHex);
    stay = chooseStay(stay);
    expect(stay.heroes.hero_p1.spaceId).toBe(entryHex);
    expect(adv(stay).pendingVisit).toBeNull();

    // CONTROL: standing ON a one-way EXIT offers no travel (exits are inert).
    let onExit = makeGame("oneway-exit-inert");
    const [ea, eTileA] = placeEmptyTile(onExit, "F1", { row: 24, col: 12 });
    const [eb, eTileB] = placeEmptyTile(ea, "F3", { row: 30, col: 18 });
    onExit = eb;
    carveOnewayField(adv(onExit), getTileFootprintSpaceIds(eTileA)[1], "oneway_entrance", 2);
    const exitOnly = getTileFootprintSpaceIds(eTileB)[1];
    carveOnewayField(adv(onExit), exitOnly, "oneway_exit", 2);
    // Walk onto the exit from an adjacent empty hex — no offer, no teleport.
    const beside = getTileFootprintSpaceIds(eTileB)[0];
    putHero(onExit, beside);
    onExit = moveHero(onExit, exitOnly);
    expect(onExit.heroes.hero_p1.spaceId).toBe(exitOnly);
    expect(adv(onExit).pendingVisit).toBeNull();
    expect(onExit.pendingChoice).toBeNull();
  });
});

// --- Guarded arrival: fight, win clears / retreat bounces --------------------

describe("teleport ARRIVAL onto a guarded destination", () => {
  /** Move onto an unguarded entry Monolith and commit travel into a guarded exit. */
  function arriveAtGuard(seed: string, guard: number): { state: GameState; entry: MapSpaceId; exit: MapSpaceId } {
    let state = makeGame(seed);
    const [afterA, tileA] = placeEmptyTile(state, "F1", { row: 24, col: 12 });
    const [afterB, tileB] = placeEmptyTile(afterA, "F3", { row: 30, col: 18 });
    state = afterB;
    const entry = carveToken(state, tileA, 1, "monolith");
    const exit = carveToken(state, tileB, 4, "monolith", guard);
    state.heroes.hero_p1.level = 7; // far above the guard — still no Quick Combat
    putHero(state, getTileFootprintSpaceIds(tileA)[0]);
    state = moveHero(state, entry);
    state = commitTravel(state);
    return { state, entry, exit };
  }

  it("opens a real bank-style fight (no auto-sweep); a WIN clears the guard and does NOT re-open the teleport", () => {
    const { state: opened, entry, exit } = arriveAtGuard("arrival-win", 4);
    let state = opened;

    // The fight opened at the destination, flagged teleportArrival, guard intact.
    expect(state.combat?.context.kind).toBe("neutral");
    if (state.combat?.context.kind === "neutral") {
      expect(state.combat.context.fieldId).toBe(exit);
      expect(state.combat.context.difficulty).toBe(0);
      expect(state.combat.context.unlimitedRounds).toBe(true);
      expect(state.combat.context.teleportArrival).toBe(true);
    }
    expect(state.heroes.hero_p1.spaceId).toBe(exit); // teleported in
    expect(adv(state).lastVisitedField.hero_p1).toBe(entry); // retreat fall-back

    // Place a unit, finish placement, then wipe the guards → a clean win.
    const place = getLegalActions(state, "p1").find((legal) => legal.action.type === "PLACE_COMBAT_UNIT");
    state = applyOk(state, place!.action);
    state = applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
    for (const unit of Object.values(state.combat!.units)) {
      if (unit.controllerId === NEUTRAL_PLAYER_ID) unit.damage = unit.maxHealth;
    }
    state.pendingChoice = null;
    finishCombatIfNeeded(state);
    finalizeAdventureCombat(state);

    // The guard is cleared, the hero still stands on the destination (arrival did
    // NOT re-open the teleport — no ping-pong), and no travel offer is pending.
    expect(state.combat).toBeNull();
    expect(adv(state).fields[exit]?.difficulty).toBeUndefined();
    expect(state.heroes.hero_p1.spaceId).toBe(exit);
    expect(adv(state).pendingVisit).toBeNull();
    expect(state.pendingChoice).toBeNull();
  });

  it("a RETREAT from the arrival fight bounces the hero back to the ORIGIN teleporter, guard intact", () => {
    const { state: opened, entry, exit } = arriveAtGuard("arrival-retreat", 4);
    const state = opened;
    expect(state.combat?.context.kind === "neutral" && state.combat.context.teleportArrival).toBe(true);

    // Force a retreat outcome and finalize (a bank-style fight has no continue
    // window; a forced timeout/AFK-drop is the only retreat path).
    state.combat!.outcome = { winnerPlayerId: NEUTRAL_PLAYER_ID, defeatedPlayerId: "p1", reason: "retreat" };
    finalizeAdventureCombat(state);

    // The hero bounced back to the ORIGIN teleporter; the guard still stands.
    expect(state.heroes.hero_p1.spaceId).toBe(entry);
    expect(adv(state).fields[exit]?.difficulty).toBe(4);
    expect(state.combat).toBeNull();
  });

  it("CONTROL: an UNGUARDED arrival opens NO fight — the hero simply stands on the destination", () => {
    const { state, exit } = arriveAtGuard("arrival-unguarded", 0);
    expect(state.combat).toBeNull();
    expect(state.heroes.hero_p1.spaceId).toBe(exit);
    expect(adv(state).pendingVisit).toBeNull();
  });
});

// --- PvP arrival + AI no-stall ----------------------------------------------

describe("PvP arrival and the AI never stalls on the new choice", () => {
  it("committing travel onto an enemy-hero destination starts a PvP battle", () => {
    let state = makeGame("arrival-pvp");
    const [afterA, tileA] = placeEmptyTile(state, "F1", { row: 24, col: 12 });
    const [afterB, tileB] = placeEmptyTile(afterA, "F3", { row: 30, col: 18 });
    state = afterB;
    const entry = carveToken(state, tileA, 1, "monolith");
    const exit = carveToken(state, tileB, 4, "monolith");
    state.heroes.hero_p2.spaceId = exit; // an enemy squats the destination
    putHero(state, getTileFootprintSpaceIds(tileA)[0]);

    state = moveHero(state, entry);
    const offer = adv(state).pendingVisit?.steps[0];
    expect(offer?.type).toBe("CHOOSE_ONE");
    if (offer?.type !== "CHOOSE_ONE") throw new Error("no offer");
    // The enemy destination is offered (labelled a battle), plus Stay.
    expect(offer.options[0].label.toLowerCase()).toContain("enemy hero");
    expect(offer.options[offer.options.length - 1].label).toContain("Stay");

    state = commitTravel(state);
    expect(state.heroes.hero_p1.spaceId).toBe(exit);
    expect(state.combat?.context.kind).toBe("player");
  });

  it("the generic computer scorer resolves the [Travel, Stay] offer without stalling", () => {
    let state = makeGame("arrival-ai");
    const [afterA, tileA] = placeEmptyTile(state, "F1", { row: 24, col: 12 });
    const [afterB, tileB] = placeEmptyTile(afterA, "F3", { row: 30, col: 18 });
    state = afterB;
    const entry = carveToken(state, tileA, 1, "monolith");
    carveToken(state, tileB, 4, "monolith");
    putHero(state, getTileFootprintSpaceIds(tileA)[0]);
    state = moveHero(state, entry);

    // The travel-vs-stay offer is open for p1; the generic scorer must pick a
    // move (never return null — that would stall the runner).
    expect(adv(state).pendingVisit?.steps[0]?.type).toBe("CHOOSE_ONE");
    const decision = chooseComputerAction(observeForComputer(state, "p1"));
    expect(decision, "the AI produced a decision (no stall)").not.toBeNull();
    expect(decision!.action.type).toBe("RESOLVE_VISIT_STEP");
    // And applying it makes progress (the visit resolves — travel or stay).
    const next = applyOk(state, decision!.action);
    expect(adv(next).pendingVisit).toBeNull();
  });
});

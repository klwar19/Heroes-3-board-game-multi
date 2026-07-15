/**
 * ============================================================================
 *  Opening home-tile free-rotation (BINH house rule)
 * ============================================================================
 *
 * "You may always rotate Map Tiles when placing or revealing them" — extended
 * to the faction Ⅰ (home) tile. At the START of each player's first turn, before
 * they may move, they are FORCED to choose a rotation for their own home tile.
 * The town and main hero sit on the rotation-invariant centre, so they never
 * move — only the six ring fields turn.
 *
 * Every assertion below checks an OBSERVABLE outcome of the engine state.
 */
import { describe, expect, it } from "vitest";
import { allTileDefinitions } from "@/data/map/tiles";
import { formatEvent, playerName } from "@/components/table/utils";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  hexNeighbors,
  hexSpaceId,
  parseHexSpaceId,
  tileFootprint,
  type AdventurePlayerConfig,
  type CustomMapTilePlan,
  type GameAction,
  type GameState
} from "./index";
import type { HeroState, MapTileState } from "./state";

/**
 * The opening ceremony with deterministic seat order: `rollFirstPlayer:false`
 * pins the seats while `rotateStartTiles:true` keeps the forced home rotation
 * on (the default couples the two; here we ask for it explicitly).
 */
function ceremonyGame(): GameState {
  return createAdventureGameState({
    seed: "home-rot",
    difficulty: "normal",
    rollFirstPlayer: false,
    rotateStartTiles: true
  });
}

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((e) => e.message).join("; ")).toHaveLength(0);
  return result.state;
}

const activeHero = (state: GameState): HeroState =>
  Object.values(state.heroes).find((h) => h.controllerId === state.activePlayerId && h.kind === "main")!;

/** Resolve the optional start-of-turn hand step for the active player, if open. */
function clearHandStep(state: GameState): GameState {
  const p = state.players[state.activePlayerId];
  if (!p.needsHandRefresh && !p.canMulligan) {
    return state;
  }
  return apply(state, { type: "REFRESH_HAND", playerId: state.activePlayerId, discardCardIds: [] });
}

describe("opening home-tile rotation is forced before the first move", () => {
  it("raises a 'starting' rotation choice on the active player's own home tile", () => {
    const state = ceremonyGame();
    const adv = state.adventure!;
    const pending = adv.pendingTileChoice;
    expect(pending, "a tile rotation is pending at game start").toBeTruthy();
    expect(pending!.kind).toBe("starting");
    expect(pending!.playerId).toBe(state.activePlayerId);

    const tile = adv.tiles[pending!.tileInstanceId];
    expect(tile.group, "it is the player's own faction Ⅰ tile").toBe("starting");
    expect(tile.awaitingRotation).toBe(true);
    // The home tile's centre is flagged by the active player (their town).
    const center = adv.fields[hexSpaceId({ row: tile.centerRow, col: tile.centerCol })];
    expect(center.flagOwnerId).toBe(state.activePlayerId);
  });

  it("offers ONLY the six rotations and blocks every other action until one is locked", () => {
    const state = ceremonyGame();
    const legal = getLegalActions(state, state.activePlayerId);
    expect(legal.length).toBeGreaterThan(0);
    expect(legal.every((l) => l.action.type === "SET_TILE_ROTATION")).toBe(true);
    // The home tile starts isolated, so the player may turn it freely: all six.
    const offered = new Set(
      legal.map((l) => (l.action as Extract<GameAction, { type: "SET_TILE_ROTATION" }>).rotation)
    );
    expect(offered).toEqual(new Set([0, 1, 2, 3, 4, 5]));

    // A move is rejected while the rotation is owed (the now-or-never gate).
    const hero = activeHero(state);
    const neighbor = hexSpaceId(hexNeighbors(parseHexSpaceId(hero.spaceId!)!)[0]);
    const blocked = applyAction(state, {
      type: "MOVE_HERO",
      playerId: state.activePlayerId,
      heroId: hero.id,
      to: neighbor
    });
    expect(blocked.errors.length).toBeGreaterThan(0);
  });

  it("turns the six ring fields but keeps the town and hero on the centre", () => {
    const state = ceremonyGame();
    const adv = state.adventure!;
    const player = state.activePlayerId;
    const pending = adv.pendingTileChoice!;
    const tile = adv.tiles[pending.tileInstanceId];
    const def = allTileDefinitions[tile.tileDefId]!;

    // The home centre (slot 0) and the six ring hexes (constant across rotation).
    const footprint0 = tileFootprint({ row: tile.centerRow, col: tile.centerCol }, 0);
    const centerId = hexSpaceId(footprint0[0]);
    const ringIds = footprint0.slice(1).map(hexSpaceId);
    const hero = activeHero(state);
    expect(hero.spaceId).toBe(centerId);

    const before = new Map(ringIds.map((id) => [id, adv.fields[id]?.location]));

    // Pick a rotation that actually re-lays the ring (the home ring is not
    // rotationally symmetric), so the turn is observable.
    const ringDef = [1, 2, 3, 4, 5, 6].map((s) => def.fields[s].location);
    const rotation =
      [1, 2, 3, 4, 5].find((r) => ringDef.some((_, d) => ringDef[d] !== ringDef[(d - r + 6) % 6])) ?? 1;

    const next = apply(state, {
      type: "SET_TILE_ROTATION",
      playerId: player,
      tileInstanceId: tile.id,
      rotation
    });
    const nadv = next.adventure!;
    const ntile = nadv.tiles[tile.id];

    // The rotation is recorded and the gate is cleared.
    expect(ntile.rotation).toBe(rotation);
    expect(ntile.awaitingRotation).toBe(false);
    expect(nadv.pendingTileChoice).toBeNull();
    expect(next.players[player].startTileRotated).toBe(true);

    // The ring actually TURNED: at least one ring hex now shows a different
    // location, and every ring hex matches the definition rotated to `rotation`.
    const after = new Map(ringIds.map((id) => [id, nadv.fields[id]?.location]));
    expect([...before].some(([id, loc]) => after.get(id) !== loc), "a ring field changed").toBe(true);
    const rotated = tileFootprint({ row: tile.centerRow, col: tile.centerCol }, rotation);
    for (let slot = 1; slot <= 6; slot += 1) {
      expect(nadv.fields[hexSpaceId(rotated[slot])]?.location).toBe(def.fields[slot].location);
    }

    // The centre is untouched: the town flag survives and the hero stays put.
    const center = nadv.fields[centerId];
    expect(center.flagOwnerId).toBe(player);
    expect(center.everFlagged).toBe(true);
    expect(next.heroes[hero.id].spaceId).toBe(centerId);
  });

  it("frees the player to act once the rotation is locked", () => {
    let state = ceremonyGame();
    const player = state.activePlayerId;
    const tileId = state.adventure!.pendingTileChoice!.tileInstanceId;
    state = apply(state, { type: "SET_TILE_ROTATION", playerId: player, tileInstanceId: tileId, rotation: 0 });

    expect(state.adventure!.pendingTileChoice).toBeNull();
    // The held-back start-of-turn hand step now resolves (it was gated behind the
    // rotation), and normal map actions are offered again.
    expect(state.players[player].canMulligan).toBe(true);
    const legal = getLegalActions(state, player);
    expect(legal.some((l) => l.action.type !== "SET_TILE_ROTATION")).toBe(true);
  });

  it("forces each player's rotation at the start of THEIR first turn, not before", () => {
    let state = ceremonyGame();
    const first = state.activePlayerId;
    // Only the active player is gated up front; the other still owes a rotation
    // but holds no pending choice yet.
    expect(state.adventure!.pendingTileChoice!.playerId).toBe(first);
    const other = Object.values(state.players).find((p) => p.id !== first && p.startTileRotated === false)!;
    expect(other.startTileRotated).toBe(false);

    // First player rotates, clears the hand step, and ends the turn.
    const firstTile = state.adventure!.pendingTileChoice!.tileInstanceId;
    state = apply(state, { type: "SET_TILE_ROTATION", playerId: first, tileInstanceId: firstTile, rotation: 0 });
    state = clearHandStep(state);
    state = apply(state, { type: "END_TURN", playerId: first });

    // Now the second player's turn has begun, and THEY are gated on their tile.
    expect(state.activePlayerId).toBe(other.id);
    const pending = state.adventure!.pendingTileChoice;
    expect(pending, "the next player is now forced to rotate").toBeTruthy();
    expect(pending!.kind).toBe("starting");
    expect(pending!.playerId).toBe(other.id);
    const tile = state.adventure!.tiles[pending!.tileInstanceId];
    const center = state.adventure!.fields[hexSpaceId({ row: tile.centerRow, col: tile.centerCol })];
    expect(center.flagOwnerId).toBe(other.id);
  });

  it("is OFF for deterministic fixtures that pin seat order (no gate, no owed rotation)", () => {
    // The 93 existing fixtures pass rollFirstPlayer:false and never opt in.
    const state = createAdventureGameState({ seed: "home-rot", difficulty: "normal", rollFirstPlayer: false });
    expect(state.adventure!.pendingTileChoice).toBeNull();
    for (const player of Object.values(state.players)) {
      expect(player.startTileRotated).toBeUndefined();
    }
  });

  it("is owner-gated in multiplayer: the other player cannot act through or steal the rotation", () => {
    const state = ceremonyGame();
    const active = state.activePlayerId;
    const other = Object.values(state.players).find((p) => p.id !== active && p.startTileRotated === false)!;
    const tileId = state.adventure!.pendingTileChoice!.tileInstanceId;

    // The waiting opponent is offered nothing while the active player's gate is up
    // — in particular they cannot rotate anyone's tile.
    expect(getLegalActions(state, other.id).some((l) => l.action.type === "SET_TILE_ROTATION")).toBe(false);

    // …and a forged confirm on the active player's behalf is rejected, leaving the
    // gate untouched (no desync between clients).
    const stolen = applyAction(state, {
      type: "SET_TILE_ROTATION",
      playerId: other.id,
      tileInstanceId: tileId,
      rotation: 2
    });
    expect(stolen.errors.length).toBeGreaterThan(0);
    expect(stolen.state.adventure!.pendingTileChoice?.playerId).toBe(active);
    expect(stolen.state.adventure!.tiles[tileId].awaitingRotation).toBe(true);
  });
});

/**
 * ============================================================================
 *  Designer-FIXED starting-tile orientation (`lockRotation`)
 * ============================================================================
 *
 * The map designer may FIX a seat's home-tile orientation: the faction tile is
 * placed at the designed rotation and that seat owes NO opening free-rotation.
 * BACKWARD COMPATIBILITY is strict — an UNLOCKED starting plan (even one that
 * stores a legacy `rotation`) keeps today's rotation-0 + opening-ceremony flow.
 */
describe("designer-FIXED starting-tile orientation (lockRotation)", () => {
  // Seat anchors reused from the skirmish scenario's own start positions, so the
  // designed starting flowers never overlap.
  const STARTS = [
    { row: 8, col: 2 },
    { row: 10, col: 7 },
    { row: 6, col: 4 }
  ];

  /** The opening ceremony (pinned seats, forced rotation on) over a designed map. */
  function ceremonyMap(customMap: CustomMapTilePlan[], players?: AdventurePlayerConfig[]): GameState {
    return createAdventureGameState({
      seed: "fixed-orient",
      difficulty: "normal",
      rollFirstPlayer: false,
      rotateStartTiles: true,
      ...(players ? { players } : {}),
      customMap
    });
  }

  /** The starting tile whose centre carries `playerId`'s home flag. */
  function startTileOf(state: GameState, playerId: string): MapTileState {
    const adv = state.adventure!;
    const tile = Object.values(adv.tiles).find((candidate) => {
      if (candidate.group !== "starting") {
        return false;
      }
      const center = adv.fields[hexSpaceId({ row: candidate.centerRow, col: candidate.centerCol })];
      return center?.flagOwnerId === playerId;
    });
    if (!tile) {
      throw new Error(`no starting tile for ${playerId}`);
    }
    return tile;
  }

  const startPlan = (seat: number, extra: Partial<CustomMapTilePlan> = {}): CustomMapTilePlan => ({
    row: STARTS[seat].row,
    col: STARTS[seat].col,
    group: "starting",
    faceDown: false,
    ...extra
  });

  it("(1) places a locked seat's tile at the designed rotation and owes NO opening rotation; an UNLOCKED plan is byte-identical to today", () => {
    // LOCKED seat 0 (rotation 3), UNLOCKED seat 1.
    const locked = ceremonyMap([startPlan(0, { lockRotation: true, rotation: 3 }), startPlan(1)]);
    expect(startTileOf(locked, "p1").rotation, "faction tile placed at the designed rotation").toBe(3);
    // Tri-state left UNDEFINED (owes nothing) — not `false` (pending) — and no
    // rotation prompt opens for the active locked seat at game start.
    expect(locked.players.p1.startTileRotated).toBeUndefined();
    expect(locked.adventure!.pendingTileChoice).toBeNull();
    // The unlocked seat 1 STILL owes the forced rotation (feature on for it).
    expect(locked.players.p2.startTileRotated).toBe(false);

    // CONTROL: the SAME seat-0 plan carrying rotation 3 but WITHOUT lockRotation —
    // a legacy map. The stored rotation is IGNORED (placed at 0) and the forced
    // opening rotation is owed + prompted for the active seat exactly as today.
    const legacy = ceremonyMap([startPlan(0, { rotation: 3 }), startPlan(1)]);
    const c1Tile = startTileOf(legacy, "p1");
    expect(c1Tile.rotation, "unlocked starting plan ignores its stored rotation").toBe(0);
    expect(legacy.players.p1.startTileRotated).toBe(false);
    const pending = legacy.adventure!.pendingTileChoice;
    expect(pending?.playerId).toBe("p1");
    expect(pending?.kind).toBe("starting");
    expect(pending?.tileInstanceId).toBe(c1Tile.id);
  });

  it("(2) the opening-rotation chain skips a locked seat mid-sequence and still forces the unlocked ones, in seat order, without stalling", () => {
    const players: AdventurePlayerConfig[] = [
      { id: "p1", name: "Alice", factionId: "castle" },
      { id: "p2", name: "Bob", factionId: "necropolis" },
      { id: "p3", name: "Cara", factionId: "rampart" }
    ];
    // Seat 0 unlocked, seat 1 LOCKED (rotation 2), seat 2 unlocked.
    let state = ceremonyMap(
      [startPlan(0), startPlan(1, { lockRotation: true, rotation: 2 }), startPlan(2)],
      players
    );

    // Up front: p1 (active, unlocked) is prompted; p2 (locked) owes nothing; p3 owes.
    expect(state.adventure!.pendingTileChoice?.playerId).toBe("p1");
    expect(state.players.p1.startTileRotated).toBe(false);
    expect(state.players.p2.startTileRotated).toBeUndefined();
    expect(state.players.p3.startTileRotated).toBe(false);

    // p1 rotates, clears the hand step, ends the turn.
    const t1 = state.adventure!.pendingTileChoice!.tileInstanceId;
    state = apply(state, { type: "SET_TILE_ROTATION", playerId: "p1", tileInstanceId: t1, rotation: 0 });
    state = clearHandStep(state);
    state = apply(state, { type: "END_TURN", playerId: "p1" });

    // p2's turn begins — LOCKED, so NO rotation prompt opens (the chain skipped
    // them) and they can act right away (no stall).
    expect(state.activePlayerId).toBe("p2");
    expect(state.adventure!.pendingTileChoice, "locked seat is never prompted").toBeNull();
    const p2Legal = getLegalActions(state, "p2");
    expect(p2Legal.length).toBeGreaterThan(0);
    expect(p2Legal.every((l) => l.action.type !== "SET_TILE_ROTATION")).toBe(true);

    // p2 ends their turn; p3's turn begins and the chain forces THEIR rotation.
    state = clearHandStep(state);
    state = apply(state, { type: "END_TURN", playerId: "p2" });
    expect(state.activePlayerId).toBe("p3");
    const pending = state.adventure!.pendingTileChoice;
    expect(pending?.playerId).toBe("p3");
    expect(pending?.kind).toBe("starting");
  });

  it("(3) rejects a rotation action targeting a locked seat's start tile (no offer + reducer guard); the unlocked CONTROL is accepted", () => {
    // p1 (active) is LOCKED at rotation 2 — the ONLY difference from the control.
    const locked = ceremonyMap([startPlan(0, { lockRotation: true, rotation: 2 }), startPlan(1)]);
    const lockedTile = startTileOf(locked, "p1");
    expect(getLegalActions(locked, "p1").some((l) => l.action.type === "SET_TILE_ROTATION")).toBe(false);
    expect(locked.adventure!.pendingTileChoice).toBeNull();
    // A forged confirm on the locked tile is rejected (no pendingTileChoice to
    // confirm — exactly like an already-rotated tile) and leaves it untouched.
    const forged = applyAction(locked, {
      type: "SET_TILE_ROTATION",
      playerId: "p1",
      tileInstanceId: lockedTile.id,
      rotation: 4
    });
    expect(forged.errors.length).toBeGreaterThan(0);
    expect(forged.state.adventure!.tiles[lockedTile.id].rotation, "locked orientation untouched").toBe(2);

    // CONTROL: the SAME active seat, UNLOCKED — a rotation IS offered and accepted.
    const control = ceremonyMap([startPlan(0), startPlan(1)]);
    expect(control.adventure!.pendingTileChoice?.playerId).toBe("p1");
    expect(getLegalActions(control, "p1").some((l) => l.action.type === "SET_TILE_ROTATION")).toBe(true);
    const controlTile = control.adventure!.pendingTileChoice!.tileInstanceId;
    const applied = apply(control, {
      type: "SET_TILE_ROTATION",
      playerId: "p1",
      tileInstanceId: controlTile,
      rotation: 1
    });
    expect(applied.adventure!.tiles[controlTile].rotation).toBe(1);
    expect(applied.players.p1.startTileRotated).toBe(true);
  });

  it("(4) announces the fixed orientation at game start (a feed line naming the seat); absent when no plan is locked", () => {
    const locked = ceremonyMap([startPlan(0, { lockRotation: true, rotation: 3 }), startPlan(1)]);
    const events = locked.eventLog.filter((e) => e.type === "START_TILE_ORIENTATION_FIXED");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "START_TILE_ORIENTATION_FIXED", playerId: "p1", rotation: 3 });
    // The VISIBLE feed line (the wiring the table feed renders) names seat + angle.
    const line = formatEvent(events[0], locked);
    expect(line).toContain(playerName(locked, "p1"));
    expect(line).toContain("180°"); // 3 × 60°
    expect(line.toLowerCase()).toContain("no opening rotation");

    // CONTROL: a map with NO locked plan emits no such event / feed line.
    const control = ceremonyMap([startPlan(0), startPlan(1)]);
    expect(control.eventLog.some((e) => e.type === "START_TILE_ORIENTATION_FIXED")).toBe(false);
  });

  it("(5) with the opening ceremony OFF, a locked plan STILL places the home tile at its designed rotation (and still announces it)", () => {
    const state = createAdventureGameState({
      seed: "fixed-orient-off",
      difficulty: "normal",
      rollFirstPlayer: false,
      rotateStartTiles: false, // ceremony OFF for everyone
      customMap: [startPlan(0, { lockRotation: true, rotation: 3 }), startPlan(1)]
    });
    const adv = state.adventure!;
    const tile = startTileOf(state, "p1");
    const def = allTileDefinitions[tile.tileDefId]!;
    // Placed at the designed rotation even though the ceremony rotates nothing.
    expect(tile.rotation).toBe(3);
    // OBSERVABLE field layout: the six ring hexes materialized per the definition
    // rotated to 3 (a real slot layout, not just a stored number).
    const rotated = tileFootprint({ row: tile.centerRow, col: tile.centerCol }, 3);
    for (let slot = 1; slot <= 6; slot += 1) {
      expect(adv.fields[hexSpaceId(rotated[slot])]?.location).toBe(def.fields[slot].location);
    }
    // Ceremony off: nobody owes a rotation, no prompt for either seat.
    expect(state.players.p1.startTileRotated).toBeUndefined();
    expect(state.players.p2.startTileRotated).toBeUndefined();
    expect(adv.pendingTileChoice).toBeNull();
    // The orientation is still map-forced, so the announcement stays.
    expect(
      state.eventLog.some((e) => e.type === "START_TILE_ORIENTATION_FIXED" && e.playerId === "p1")
    ).toBe(true);
  });
});

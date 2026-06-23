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
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  hexNeighbors,
  hexSpaceId,
  parseHexSpaceId,
  tileFootprint,
  type GameAction,
  type GameState
} from "./index";
import type { HeroState } from "./state";

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
});

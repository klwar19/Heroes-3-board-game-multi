import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  getTileFootprintSpaceIds,
  hexSpaceId,
  tileLatticeNeighbors,
  type GameState
} from "@/engine";
import { instantiateTile, nearbyRerotateEligibleTiles } from "@/engine/adventure";
import type { HexCoord } from "@/engine/hex";

// ---------------------------------------------------------------------------
// Tournament rule: the Redwood Observatory AND the Speculum artifact may ALSO
// re-rotate one NEARBY, already-placed tile (a tile whose flower touches the
// hero's own tile, with no Hero / Town / Subterranean Gate on it). It reuses the
// safe in-place `rotateTileInPlace` primitive — the same one the Disruption
// Astrologers card uses — so a re-rotated tile keeps every field's state and
// only re-keys which hex each ring field sits on.
//
// Every assertion below has a rule-OFF or eligibility CONTROL so removing the
// wiring fails the test.
// ---------------------------------------------------------------------------

function freshGame(seed: string, rerotate: boolean): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    tournamentObservatoryRerotate: rerotate
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  return state;
}

/** One empty lattice-neighbour slot of `center`. */
function firstEmptyNeighbour(state: GameState, center: HexCoord): HexCoord {
  const adventure = state.adventure!;
  const free = tileLatticeNeighbors(center).find(
    (candidate) =>
      !Object.values(adventure.tiles).some(
        (tile) => tile.centerRow === candidate.row && tile.centerCol === candidate.col
      )
  );
  if (!free) {
    throw new Error("need a free neighbour slot");
  }
  return free;
}

/** Serialize the location sitting on each of a tile's seven footprint hexes. */
function footprintLocations(state: GameState, tileId: string): string {
  const adventure = state.adventure!;
  const tile = adventure.tiles[tileId];
  return getTileFootprintSpaceIds(tile)
    .map((spaceId) => `${spaceId}:${adventure.fields[spaceId]?.location ?? "-"}`)
    .join("|");
}

/**
 * Places the hero on its own face-up tile at O, a re-rotatable face-up neighbour,
 * gives the hero a Speculum, and plays the "discover an adjacent map tile" option.
 */
function playSpeculum(state: GameState): { anchorId: string; nearbyId: string } {
  const O: HexCoord = { row: 40, col: 30 };
  const anchor = instantiateTile(state.adventure!, "N1", O, 0, false); // hero's own tile
  const nearbySlot = firstEmptyNeighbour(state, O);
  const nearby = instantiateTile(state.adventure!, "N2", nearbySlot, 0, false); // placed, face-up
  state.heroes.hero_p1.spaceId = hexSpaceId(O);
  state.players.p1.hand = ["artifact.speculum"];

  const play = getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === "artifact.speculum" &&
      legal.action.optionIndex === 0
  );
  if (!play) {
    throw new Error("Speculum discover option is not a legal map play");
  }
  const applied = applyAction(state, play.action).state;
  // Copy the mutated state back onto the caller's reference for follow-on actions.
  Object.assign(state, applied);
  return { anchorId: anchor.id, nearbyId: nearby.id };
}

describe("Tournament rule — Observatory / Speculum re-rotate a nearby tile", () => {
  it("freezes onto adventure state (explicit flag, tournamentMode fallback, default OFF)", () => {
    expect(freshGame("rerotate-on", true).adventure!.tournamentObservatoryRerotate).toBe(true);
    expect(freshGame("rerotate-off", false).adventure!.tournamentObservatoryRerotate).toBeFalsy();
    // The master Tournament mode enables it via the same fallback as the other rules.
    const master = createAdventureGameState({ seed: "rerotate-master", difficulty: "hard", rollFirstPlayer: false, tournamentMode: true });
    expect(master.adventure!.tournamentObservatoryRerotate).toBe(true);
  });

  it("offers a nearby placed tile to re-rotate and actually rotates it in place", () => {
    const state = freshGame("rerotate-speculum", true);
    const { nearbyId } = playSpeculum(state);

    // With the rule on, the discover reward opens the re-rotate offer FIRST.
    const offer = state.adventure!.pendingVisit?.steps[0];
    expect(offer?.type).toBe("CHOOSE_ONE");
    expect((offer as { prompt?: string }).prompt).toMatch(/re-rotate one nearby tile/i);

    const before = footprintLocations(state, nearbyId);
    const beforeRotation = state.adventure!.tiles[nearbyId].rotation;

    // Option 0 = re-rotate the (only eligible) nearby tile → opens the how-much choice.
    const afterPick = applyAction(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 }).state;
    const howMuch = afterPick.adventure!.pendingVisit?.steps[0];
    expect(howMuch?.type).toBe("CHOOSE_ONE");
    expect((howMuch as { prompt?: string }).prompt).toMatch(/by how much/i);

    // Option 0 = "Turn 60° clockwise" → applies rotateTileInPlace.
    const afterRotate = applyAction(afterPick, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 }).state;

    // Observable outcome: the tile's orientation changed AND its ring fields
    // re-keyed onto different hexes (not just an inert rotation counter bump).
    const rotated = afterRotate.adventure!.tiles[nearbyId];
    expect(rotated.rotation).not.toBe(beforeRotation);
    expect(footprintLocations(afterRotate, nearbyId)).not.toBe(before);
    // Integrity: every footprint field still belongs to the rotated tile.
    for (const spaceId of getTileFootprintSpaceIds(rotated)) {
      expect(afterRotate.adventure!.fields[spaceId]?.tileInstanceId).toBe(nearbyId);
    }
    // The discover step remains queued behind the re-rotate (the rule is "TOO").
    expect(afterRotate.adventure!.pendingVisit?.steps[0]?.type).toBe("DISCOVER_ADJACENT_TILE");
  });

  it("CONTROL: with the rule OFF the discover opens straight to DISCOVER_ADJACENT_TILE (no re-rotate offer)", () => {
    const state = freshGame("rerotate-control-off", false);
    playSpeculum(state);
    expect(state.adventure!.pendingVisit?.steps[0]?.type).toBe("DISCOVER_ADJACENT_TILE");
  });

  it("CONTROL: a nearby tile with a Hero on it is NOT offered (no-Hero eligibility gate)", () => {
    const state = freshGame("rerotate-hero-gate", true);
    const O: HexCoord = { row: 40, col: 30 };
    instantiateTile(state.adventure!, "N1", O, 0, false);
    const nearbySlot = firstEmptyNeighbour(state, O);
    const nearby = instantiateTile(state.adventure!, "N2", nearbySlot, 0, false);
    state.heroes.hero_p1.spaceId = hexSpaceId(O);

    // Baseline: with no hero on it, the nearby tile IS eligible.
    expect(nearbyRerotateEligibleTiles(state, hexSpaceId(O)).map((t) => t.id)).toContain(nearby.id);

    // Park a hero on the nearby tile's centre → it drops out of the eligible set.
    state.heroes.hero_p1.spaceId = hexSpaceId({ row: nearby.centerRow, col: nearby.centerCol });
    expect(nearbyRerotateEligibleTiles(state, hexSpaceId(O)).map((t) => t.id)).not.toContain(nearby.id);
  });
});

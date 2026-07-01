import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  hexSpaceId,
  observatoryRevealTargets,
  tileLatticeNeighbors,
  tileLayer,
  type GameState
} from "@/engine";
import { instantiateTile } from "@/engine/adventure";
import type { HexCoord } from "@/engine/hex";

// ---------------------------------------------------------------------------
// The Redwood Observatory and the Speculum artifact scry on the HERO'S OWN
// layer only. The Surface↔Subterranean divide is opaque to scrying exactly as
// it is to movement (a Gate is the only crossing): an Underground hero MAY
// reveal Underground tiles, but a Surface hero can NEVER reveal an Underground
// (subterranean-group) tile with either object — and vice-versa.
//
// The control in every case is a same-layer face-down neighbour that IS
// revealable, so the assertions fail if the layer filter is dropped (removing it
// would let a Surface hero reach the Underground neighbour, and an Underground
// hero the Surface neighbour).
// ---------------------------------------------------------------------------

function freshGame(seed: string): GameState {
  const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  return state;
}

/** Two distinct lattice-neighbour slots of `center` that are empty. */
function twoEmptyNeighbours(state: GameState, center: HexCoord): [HexCoord, HexCoord] {
  const adventure = state.adventure!;
  const free = tileLatticeNeighbors(center).filter(
    (candidate) =>
      !Object.values(adventure.tiles).some(
        (tile) => tile.centerRow === candidate.row && tile.centerCol === candidate.col
      )
  );
  if (free.length < 2) {
    throw new Error("need two free neighbour slots");
  }
  return [free[0], free[1]];
}

describe("Redwood Observatory — reveals only on the hero's own layer", () => {
  it("a Surface hero cannot reveal an adjacent Underground tile (but CAN reveal the Surface neighbour)", () => {
    const state = freshGame("obs-surface-layer");
    const O: HexCoord = { row: 40, col: 30 };
    const observatory = instantiateTile(state.adventure!, "F7", O, 0, false); // Surface observatory
    const [surfaceSlot, underSlot] = twoEmptyNeighbours(state, O);
    const surfaceNeighbour = instantiateTile(state.adventure!, "N1", surfaceSlot, 0, true); // Surface, face-down
    const underNeighbour = instantiateTile(state.adventure!, "U1", underSlot, 0, true); // Underground, face-down

    expect(tileLayer(surfaceNeighbour)).toBe("surface");
    expect(tileLayer(underNeighbour)).toBe("subterranean");

    // Hero stands on the Surface observatory.
    state.heroes.hero_p1.spaceId = hexSpaceId(O);

    const revealable = observatoryRevealTargets(state, state.heroes.hero_p1, observatory).map((tile) => tile.id);
    expect(revealable).toContain(surfaceNeighbour.id); // control: same-layer tile IS revealable
    expect(revealable).not.toContain(underNeighbour.id); // the divide is opaque to scrying
  });

  it("an Underground hero CAN reveal an adjacent Underground tile (but NOT the Surface neighbour)", () => {
    const state = freshGame("obs-under-layer");
    const O: HexCoord = { row: 40, col: 30 };
    const observatory = instantiateTile(state.adventure!, "U2", O, 0, false); // Underground observatory tile
    const [underSlot, surfaceSlot] = twoEmptyNeighbours(state, O);
    const underNeighbour = instantiateTile(state.adventure!, "U1", underSlot, 0, true); // Underground, face-down
    const surfaceNeighbour = instantiateTile(state.adventure!, "N1", surfaceSlot, 0, true); // Surface, face-down

    expect(tileLayer(observatory)).toBe("subterranean");

    // Hero stands on the Underground observatory.
    state.heroes.hero_p1.spaceId = hexSpaceId(O);

    const revealable = observatoryRevealTargets(state, state.heroes.hero_p1, observatory).map((tile) => tile.id);
    expect(revealable).toContain(underNeighbour.id); // Underground hero reveals Underground: allowed
    expect(revealable).not.toContain(surfaceNeighbour.id); // …but not across the divide to the Surface
  });
});

describe("Speculum artifact — reveals only on the hero's own layer", () => {
  it("a Surface hero playing Speculum is not offered the adjacent Underground tile", () => {
    const state = freshGame("speculum-surface-layer");
    const O: HexCoord = { row: 40, col: 30 };
    instantiateTile(state.adventure!, "F7", O, 0, false); // hero's own Surface tile (the Speculum anchor)
    const [surfaceSlot, underSlot] = twoEmptyNeighbours(state, O);
    const surfaceNeighbour = instantiateTile(state.adventure!, "N1", surfaceSlot, 0, true);
    const underNeighbour = instantiateTile(state.adventure!, "U1", underSlot, 0, true);

    // Hero stands on its own Surface tile centre.
    state.heroes.hero_p1.spaceId = hexSpaceId(O);
    state.players.p1.hand = ["artifact.speculum"];

    const play = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "artifact.speculum" &&
        legal.action.optionIndex === 0
    );
    expect(play, "Speculum discover option is a legal map play").toBeTruthy();
    const opened = applyAction(state, play!.action).state;
    expect(opened.adventure!.pendingVisit?.steps[0]?.type).toBe("DISCOVER_ADJACENT_TILE");

    // The reveal targets, index-aligned with the DISCOVER_ADJACENT_TILE options,
    // are the hero-layer neighbours only: the Surface tile is offered, the
    // Underground tile is not.
    const targets = observatoryRevealTargets(
      opened,
      opened.heroes.hero_p1,
      opened.adventure!.tiles[opened.adventure!.fields[hexSpaceId(O)]!.tileInstanceId]
    ).map((tile) => tile.id);
    expect(targets).toContain(surfaceNeighbour.id);
    expect(targets).not.toContain(underNeighbour.id);
  });
});

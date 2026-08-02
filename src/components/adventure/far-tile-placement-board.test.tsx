// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { HexMapBoard } from "./screen";
import {
  createAdventureGameState,
  getLegalActions,
  getPlayerView,
  type GameAction,
  type GameState,
  type HeroState
} from "@/engine";
import { farTilePlacementCenters } from "@/engine/adventure";
import { UNOPENED_FAR_TILE } from "@/engine/state";

afterEach(cleanup);

// ---------------------------------------------------------------------------
// A Ⅱ–Ⅲ (Far) supply tile may be laid at the border by EITHER of a player's
// heroes. Each placement ghost is tagged (by placementCenters) with the hero
// that can actually reach that slot; clicking it must dispatch PLACE_TILE AS
// THAT HERO — not the currently-selected hero (which defaults to the Main
// Hero). The old code hard-coded `myHero.id`, so a Secondary Hero's border
// slot dispatched the Main Hero's id and the engine rejected it — the
// Secondary Hero could never place a tile. jsdom pins the dispatched heroId.
// ---------------------------------------------------------------------------

function twoHeroPlacementState(): { state: GameState; secondaryId: string; mainId: string } {
  const state = createAdventureGameState({
    seed: "far-tile-2nd-hero",
    difficulty: "normal",
    rollFirstPlayer: false,
    creatureBanks: false
  });
  state.activePlayerId = "p1";
  state.players.p1.needsHandRefresh = false;
  state.players.p1.canMulligan = false;
  const adventure = state.adventure!;
  adventure.pendingTileChoice = null;
  adventure.pendingVisit = null;

  // p1 holds one unopened Far supply tile and the pool is not empty.
  adventure.playerFarTiles = { ...(adventure.playerFarTiles ?? {}), p1: [UNOPENED_FAR_TILE] };
  if ((adventure.farTilePool?.length ?? 0) === 0) {
    adventure.farTilePool = ["F1", "F2", "F3"];
  }

  const mainHero = Object.values(state.heroes).find(
    (hero) => hero.controllerId === "p1" && hero.kind === "main"
  )!;
  // Neutralise the Main Hero: with 0 movement it is skipped by placementCenters,
  // so EVERY rendered ghost is tagged with the Secondary Hero — yet `myHero`
  // still defaults to the Main Hero, exactly the case the bug mis-dispatched.
  mainHero.movementPoints = 0;

  const secondary: HeroState = {
    id: "hero_p1_secondary",
    heroDefId: mainHero.heroDefId,
    controllerId: "p1",
    kind: "secondary",
    level: 1,
    experience: 0,
    movementPoints: 3,
    movementPointsMax: 3,
    spaceId: mainHero.spaceId
  };
  state.heroes.hero_p1_secondary = secondary;

  // Park the Secondary Hero on a field that exposes a legal Far-tile slot
  // (the same lattice helper the ghosts use).
  let parked = false;
  for (const field of Object.values(adventure.fields)) {
    secondary.spaceId = field.spaceId;
    if (farTilePlacementCenters(state, secondary).length > 0) {
      parked = true;
      break;
    }
  }
  expect(parked, "fixture map should expose a placeable Far slot for the Secondary Hero").toBe(true);

  return { state, secondaryId: secondary.id, mainId: mainHero.id };
}

describe("Far-tile placement ghost — Secondary Hero", () => {
  it("dispatches PLACE_TILE as the hero that can reach the slot, not the selected Main Hero", () => {
    const { state, secondaryId, mainId } = twoHeroPlacementState();
    const onAction = vi.fn();
    const { container } = render(
      <HexMapBoard
        state={state}
        view={getPlayerView(state, "p1")}
        viewerPlayerId="p1"
        legalActions={getLegalActions(state, "p1")}
        onAction={onAction}
        placement={{ supplyIndex: 0 }}
        moveCue={null}
      />
    );

    const ghost = container.querySelector(".placementGhostFlower");
    expect(ghost, "a placement ghost should render for the Secondary Hero's slot").not.toBeNull();

    fireEvent.click(ghost!);

    expect(onAction).toHaveBeenCalledTimes(1);
    const action = onAction.mock.calls[0][0] as Extract<GameAction, { type: "PLACE_TILE" }>;
    expect(action.type).toBe("PLACE_TILE");
    // The fix: the ghost's OWN hero (secondary), never the selected/main hero.
    expect(action.heroId).toBe(secondaryId);
    expect(action.heroId).not.toBe(mainId);
    expect(action.supplyIndex).toBe(0);
  });
});

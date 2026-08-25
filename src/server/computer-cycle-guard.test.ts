import { describe, expect, it, vi } from "vitest";

// Force a WORST-CASE policy: whenever a Subterranean-Gate twin hop is legal,
// take it. The free hop costs 0 MP and the live pump paces ONE action per tick
// with a fresh runner, so before the cycle guard this shuffled the hero
// between the two gate halves FOREVER on a live table (the reported
// "AI keeps moving between the underground gate and the entrance").
// Everything else in the engine stays real.
vi.mock("@/engine", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/engine")>();
  return {
    ...original,
    chooseComputerAction: (observation: {
      state: { adventure?: { fields: Record<string, { location?: string }> } };
      legalActions: Array<{ action: { type: string; to?: string } }>;
    }) => {
      const hop = observation.legalActions.find(
        (legal) =>
          legal.action.type === "MOVE_HERO" &&
          legal.action.to !== undefined &&
          observation.state.adventure?.fields[legal.action.to]?.location ===
            "subterranean_gate",
      );
      const pick =
        hop ??
        observation.legalActions.find(
          (legal) => legal.action.type === "END_TURN",
        ) ??
        observation.legalActions[0];
      return pick
        ? { action: pick.action, policy: "mock.gate-hopper", score: 999 }
        : null;
    },
  };
});

import { createAdventureGameState, standardComputerController } from "@/engine";
import { getAdjacentSpaceIds } from "@/engine/adventure";
import type { GameState, MapSpaceId } from "@/engine/state";
import { driveComputerPlayers } from "./computer-runner";

function carveGateUnderHero(state: GameState): [MapSpaceId, MapSpaceId] {
  const hero = Object.values(state.heroes).find(
    (candidate) => candidate.controllerId === "p1" && candidate.kind === "main",
  )!;
  const fields = state.adventure!.fields;
  const tiles = state.adventure!.tiles;
  const heroField = fields[hero.spaceId!];
  // Surface half right beside the hero (off-lattice ghost cells).
  const surfaceGate = getAdjacentSpaceIds(hero.spaceId!).find(
    (id) => !fields[id],
  )!;
  fields[surfaceGate] = {
    ...heroField,
    spaceId: surfaceGate,
    location: "subterranean_gate",
    flagOwnerId: null,
    blackCube: false,
  };
  delete fields[surfaceGate].difficulty;
  tiles["tile_under"] = {
    ...tiles[heroField.tileInstanceId],
    id: "tile_under",
    group: "subterranean",
    faceDown: false,
  } as (typeof tiles)[string];
  const uGate = getAdjacentSpaceIds(surfaceGate).find((id) => !fields[id])!;
  fields[uGate] = {
    ...heroField,
    spaceId: uGate,
    location: "subterranean_gate",
    tileInstanceId: "tile_under",
    flagOwnerId: null,
    blackCube: false,
  };
  delete fields[uGate].difficulty;
  fields[surfaceGate].gateLinkSpaceId = uGate;
  fields[uGate].gateLinkSpaceId = surfaceGate;
  return [surfaceGate, uGate];
}

describe("computer runner — cross-tick cycle guard", () => {
  it("refuses a zero-cost action that returns the seat to a state it already left this turn", () => {
    const state = createAdventureGameState({
      seed: "cycle-guard",
      rollFirstPlayer: false,
      events: false,
    });
    state.controllers = { p1: standardComputerController() };
    state.activePlayerId = "p1";
    const [surfaceGate] = carveGateUnderHero(state);
    // Stand the hero ON the surface half with no movement points: the FREE
    // twin hop is the only legal move, in both directions, forever.
    const hero = Object.values(state.heroes).find(
      (candidate) => candidate.controllerId === "p1" && candidate.kind === "main",
    )!;
    hero.spaceId = surfaceGate;
    hero.movementPoints = 0;

    // Live-pump pacing: fresh runner per tick. The mocked policy takes a gate
    // hop whenever one is legal — without the persisted cycle guard this
    // applies A→B, B→A, A→B... one hop per tick with no end.
    let current: GameState = state;
    let hops = 0;
    for (let tick = 0; tick < 12; tick += 1) {
      const run = driveComputerPlayers(current, undefined, { maxSteps: 1 });
      if (run.decisions.length === 0) break;
      hops += run.decisions.filter(
        (decision) => decision.action.type === "MOVE_HERO",
      ).length;
      current = run.state;
    }

    // ONE hop through the gate is fine; the hop BACK reproduces the departed
    // state and must be discarded (the mocked policy then falls to END_TURN).
    expect(hops).toBeLessThanOrEqual(2);
    // The guard's hash trail is persisted state, cleared at end of turn.
    expect(
      current.computerMemory?.p1?.recentStateHashes ?? [],
    ).toEqual([]);
  });
});

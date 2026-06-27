import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureLobbyState,
  type CustomMapTilePlan,
  type FactionId,
  type GameAction,
  type GameState
} from "./index";

/**
 * The map-setup lobby end of the shared-map feature: picking a saved map sends a
 * single SET_GAME_OPTIONS carrying the scenario, the seat count the map was
 * designed for, and its tiles (see SavedMapPicker.onPick in screen.tsx). These
 * tests prove that exact payload OPENS the right number of seats and starts a
 * real game on the designed map — the observable outcome, not an intermediate
 * flag — with a graded control showing the seat count is genuinely scenario-clamped.
 */

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

// A 4-seat design on the skirmish sheet: its own Ⅰ tiles at the four seats plus
// three supply tiles (all non-overlapping scenario slots).
const QUAD_MAP: CustomMapTilePlan[] = [
  { row: 8, col: 2, group: "starting", faceDown: false },
  { row: 10, col: 7, group: "starting", faceDown: false },
  { row: 6, col: 4, group: "starting", faceDown: false },
  { row: 12, col: 5, group: "starting", faceDown: false },
  { row: 9, col: 4, group: "center", faceDown: true },
  { row: 7, col: 6, group: "far", faceDown: true },
  { row: 11, col: 2, group: "far", faceDown: true }
];

const QUAD_SEATS: { playerId: string; factionId: FactionId; heroDefId: string }[] = [
  { playerId: "p1", factionId: "castle", heroDefId: "catherine" },
  { playerId: "p2", factionId: "rampart", heroDefId: "gelu" },
  { playerId: "p3", factionId: "inferno", heroDefId: "xyron" },
  { playerId: "p4", factionId: "stronghold", heroDefId: "crag_hack" }
];

describe("saved map player count flows through the lobby", () => {
  it("opens the designed seat count and starts a real game on the designed map", () => {
    // Start on a 2-player-only scenario, exactly as if the lobby were mid-setup
    // when someone picks a 4-player skirmish map.
    let state = createAdventureLobbyState({ seed: "quad-map", scenarioId: "land-2p" });
    expect(state.setupLobby?.seats).toHaveLength(2);

    // The picker's one-shot payload: switch scenario, open 4 seats, apply the map.
    state = apply(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { scenarioId: "skirmish", playerCount: 4, customMap: QUAD_MAP, customMapName: "Quad" }
    });

    // The seat count was NOT clamped away — switching to skirmish first unlocked 4.
    expect(state.setupLobby?.seats).toHaveLength(4);
    expect(state.setupLobby?.options.playerCount).toBe(4);
    expect(state.setupLobby?.options.customMap).toHaveLength(QUAD_MAP.length);
    expect(state.setupLobby?.options.customMapName).toBe("Quad");

    // Seat all four and start — the designed map must carry a 4-player game.
    for (const seat of QUAD_SEATS) {
      state = apply(state, {
        type: "CHOOSE_FACTION",
        playerId: seat.playerId,
        factionId: seat.factionId,
        heroDefId: seat.heroDefId
      });
    }
    state = apply(state, { type: "START_ADVENTURE", playerId: "p1" });

    expect(state.phase).toBe("player-turn");
    expect(state.turnOrder).toHaveLength(4);
    // One town + one main hero per seat — a real 4-player board.
    expect(Object.keys(state.towns)).toHaveLength(4);
    expect(Object.values(state.heroes).filter((hero) => hero.kind === "main")).toHaveLength(4);
    expect(state.towns.town_p4.factionId).toBe("stronghold");
    // Every designed tile (4 starts + 3 supply) is on the board.
    expect(Object.values(state.adventure!.tiles)).toHaveLength(QUAD_MAP.length);
  });

  it("CONTROL: the same 4-seat request on a 2-player scenario clamps to 2 seats", () => {
    // Identical payload but WITHOUT switching scenario: land-2p tops out at 2, so
    // the seat count must clamp — proving the count is scenario-driven, and that
    // the success case above only got 4 seats because it switched to skirmish first.
    let state = createAdventureLobbyState({ seed: "duel-map", scenarioId: "land-2p" });
    state = apply(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { playerCount: 4, customMap: QUAD_MAP, customMapName: "Quad" }
    });
    expect(state.setupLobby?.seats).toHaveLength(2);
    expect(state.setupLobby?.options.playerCount).toBe(2);
  });
});

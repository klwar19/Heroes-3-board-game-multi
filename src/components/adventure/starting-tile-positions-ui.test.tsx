// @vitest-environment jsdom
/**
 * WHO STARTS WHERE — the Heroes & Draft matrix for
 * `GameSetupOptions.startingTileAssignments`.
 *
 * jsdom cannot compute CSS, so these cases pin the DOM CONTRACT and the exact
 * dispatched `SET_GAME_OPTIONS` payload only — never a pixel. The engine half
 * lives in `src/engine/starting-tile-assignments.test.ts`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import {
  applyAction,
  createAdventureLobbyState,
  type CustomMapTilePlan,
  type GameAction,
  type GameState
} from "@/engine";
import { scenarioDefinitions } from "@/data/map/scenarios";
import { SetupLobbyScreen } from "./screen";

vi.mock("@/lib/shared-maps", () => ({ fetchSharedMaps: vi.fn(async () => []) }));
afterEach(cleanup);

const starts = scenarioDefinitions.skirmish.layout.starts;

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function show(state: GameState, onAction = vi.fn()) {
  render(<SetupLobbyScreen onAction={onAction} state={state} viewerPlayerId="p1" />);
  fireEvent.click(screen.getByRole("button", { name: /Heroes & Draft/ }));
  return onAction;
}

function towns(roles: readonly ("human" | "computer" | undefined)[]): CustomMapTilePlan[] {
  return roles.map((role, index) => ({
    ...starts[index],
    group: "starting" as const,
    faceDown: false,
    ...(role ? { coopSeat: { role } } : {})
  }));
}

describe("starting-position seating picker", () => {
  it("shows one row per starting position and dispatches ONE complete record", () => {
    const state = createAdventureLobbyState({ seed: "seating-ui", scenarioId: "skirmish" });
    const onAction = show(state);

    const picker = screen.getByRole("region", { name: "Starting positions" });
    // The scenario offers six positions for two seats.
    expect(picker.querySelectorAll("[data-starting-tile]")).toHaveLength(starts.length);
    expect(picker.textContent).toContain("S1 · Free");

    // Default (no record): S1 shows the first seat, S3 shows Empty.
    const rowGroup = (position: number) =>
      within(screen.getByRole("group", { name: `Seat at starting position S${position}` }));
    expect(rowGroup(3).getByRole("button", { name: "Empty" }).getAttribute("aria-pressed")).toBe(
      "true"
    );

    fireEvent.click(rowGroup(3).getByRole("button", { name: /^Player 1/ }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      // p1 moves to S3 (index 2); p2 keeps its default index 1.
      options: { startingTileAssignments: { p1: 2, p2: 1 } }
    });
  });

  it("SWAPS two seats rather than double-booking a position", () => {
    const state = createAdventureLobbyState({ seed: "seating-ui-swap", scenarioId: "skirmish" });
    state.setupLobby!.options.startingTileAssignments = { p1: 0, p2: 1 };
    const onAction = show(state);
    fireEvent.click(
      within(screen.getByRole("group", { name: "Seat at starting position S1" })).getByRole(
        "button",
        { name: /^Player 2/ }
      )
    );
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { startingTileAssignments: { p1: 1, p2: 0 } }
    });
  });

  it("DISABLES a chip the map's own role forbids and names the reason", () => {
    let state = createAdventureLobbyState({ seed: "seating-ui-roles", scenarioId: "skirmish" });
    state = apply(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { customMap: towns(["computer", "human", undefined]) }
    });
    show(state);

    const picker = screen.getByRole("region", { name: "Starting positions" });
    expect(picker.querySelectorAll("[data-starting-tile]"), "designed Towns win").toHaveLength(3);
    expect(picker.textContent).toContain("S1 · Only AI");
    expect(picker.textContent).toContain("S2 · Only player");

    // Both lobby seats are human, so the AI-only S1 offers no seat at all…
    const s1 = within(screen.getByRole("group", { name: "Seat at starting position S1" }));
    const forbidden = s1.getByRole("button", { name: /^Player 1/ }) as HTMLButtonElement;
    expect(forbidden.disabled).toBe(true);
    expect(forbidden.getAttribute("title")).toBe(
      "This map reserves this starting Town for the computer."
    );
    // …while the player-only S2 takes either human seat.
    const s2 = within(screen.getByRole("group", { name: "Seat at starting position S2" }));
    expect((s2.getByRole("button", { name: /^Player 1/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("resets to Default, and works in a SINGLE-PLAYER lobby with a computer seat", () => {
    const solo = createAdventureLobbyState({
      seed: "seating-ui-solo",
      scenarioId: "skirmish",
      sessionMode: "single-player",
      computerOpponents: 1
    });
    solo.setupLobby!.options.startingTileAssignments = { p1: 1, p2: 0 };
    const onAction = show(solo);
    const picker = screen.getByRole("region", { name: "Starting positions" });
    expect(picker.textContent, "the AI seat is on the matrix too").toContain("(Computer)");
    fireEvent.click(within(picker).getByRole("button", { name: "Default" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { startingTileAssignments: {} }
    });
  });
});

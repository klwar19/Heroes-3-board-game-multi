// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoomPanel } from "./room-panel";
import { applyAction, createAdventureGameState, type GameAction, type GameState } from "@/engine";

afterEach(cleanup);

/** A 2-seat game with three members; c1 hosts, c2 at p1, c3 observing. */
function hostedState(): GameState {
  let state = createAdventureGameState({ seed: "room-panel", difficulty: "normal", rollFirstPlayer: false });
  for (const [clientId, name] of [
    ["c1", "Alice"],
    ["c2", "Bob"],
    ["c3", "Cara"]
  ] as const) {
    state = applyAction(state, { type: "JOIN_ROOM", clientId, name }).state;
  }
  state = applyAction(state, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true }).state;
  state = applyAction(state, { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c2", seat: "p1" }).state;
  return state;
}

function renderPanel(state: GameState, clientId: string, onAction = vi.fn()) {
  const onCloseRoom = vi.fn();
  const onBrowseRooms = vi.fn();
  render(
    <RoomPanel
      state={state}
      roomId="abc123"
      clientId={clientId}
      displayName={state.room?.members.find((m) => m.clientId === clientId)?.name ?? ""}
      onAction={onAction}
      onRename={vi.fn()}
      onCloseRoom={onCloseRoom}
      onBrowseRooms={onBrowseRooms}
    />
  );
  // Expand the collapsed panel.
  fireEvent.click(screen.getByRole("button", { name: /Room/i }));
  return { onAction, onCloseRoom, onBrowseRooms };
}

describe("RoomPanel — open table", () => {
  it("offers 'Host this room' and no seat controls", () => {
    let state = createAdventureGameState({ seed: "open", difficulty: "normal", rollFirstPlayer: false });
    state = applyAction(state, { type: "JOIN_ROOM", clientId: "c1", name: "Solo" }).state;
    const { onAction } = renderPanel(state, "c1");

    fireEvent.click(screen.getByRole("button", { name: /Host this room/i }));
    expect(onAction).toHaveBeenCalledWith({ type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true });

    // No seat dropdowns on an open table.
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});

describe("RoomPanel — hosted (host's view)", () => {
  it("shows a seat selector per member and assigns seats", () => {
    const state = hostedState();
    const { onAction } = renderPanel(state, "c1");

    const selects = screen.getAllByRole("combobox");
    expect(selects).toHaveLength(3); // one per member, host-only

    // Seat Cara (c3) at p2 via her selector.
    const caraSelect = screen.getByLabelText("Seat for Cara") as HTMLSelectElement;
    fireEvent.change(caraSelect, { target: { value: "p2" } });
    expect(onAction).toHaveBeenCalledWith({
      type: "ASSIGN_SEAT",
      clientId: "c1",
      targetClientId: "c3",
      seat: "p2"
    });
  });

  it("offers kick / transfer for other members but not the host themselves", () => {
    const state = hostedState();
    const { onAction } = renderPanel(state, "c1");

    const bobRow = screen.getByText("Bob").closest("li") as HTMLElement;
    fireEvent.click(within(bobRow).getByTitle(/Remove Bob/i));
    expect(onAction).toHaveBeenCalledWith({ type: "KICK_MEMBER", clientId: "c1", targetClientId: "c2" });

    // The host's own row (Alice) has no kick button.
    const aliceRow = screen.getByText("Alice").closest("li") as HTMLElement;
    expect(within(aliceRow).queryByTitle(/Remove Alice/i)).toBeNull();
  });
});

describe("RoomPanel — hosted (a seated player's view)", () => {
  it("locks seats: read-only badges, no dropdowns, no kick", () => {
    const state = hostedState();
    renderPanel(state, "c2"); // Bob, seated at p1, not host

    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByTitle(/Remove/i)).toBeNull();
    // Bob sees he is seated (his seat badge shows the player's name).
    const bobRow = screen.getByText("Bob").closest("li") as HTMLElement;
    expect(within(bobRow).getByText(state.players.p1.name)).toBeTruthy();
  });
});

/**
 * Guard: the UI never offers a control the engine would reject. Every action
 * the host's panel can fire is accepted by applyAction; the same action fired
 * by a non-host seat is rejected. (Pins the UI to the engine rules.)
 */
describe("RoomPanel actions agree with the engine", () => {
  it("host assign is accepted; the same assign from a player is rejected", () => {
    const state = hostedState();

    const hostAssign: GameAction = { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c3", seat: "p2" };
    expect(applyAction(state, hostAssign).errors).toHaveLength(0);

    const playerAssign: GameAction = { type: "ASSIGN_SEAT", clientId: "c2", targetClientId: "c3", seat: "p2" };
    expect(applyAction(state, playerAssign).errors.length).toBeGreaterThan(0);
  });
});

describe("RoomPanel — naming, closing and browsing", () => {
  it("an open-table member can rename the room and close it", () => {
    let state = createAdventureGameState({ seed: "name-open", difficulty: "normal", rollFirstPlayer: false });
    state = applyAction(state, { type: "JOIN_ROOM", clientId: "c1", name: "Solo" }).state;
    const { onAction, onCloseRoom } = renderPanel(state, "c1");

    const nameInput = screen.getByLabelText("Room name") as HTMLInputElement;
    expect(nameInput.disabled).toBe(false);
    fireEvent.change(nameInput, { target: { value: "My Table" } });
    fireEvent.click(within(nameInput.closest(".roomTitleRow") as HTMLElement).getByRole("button", { name: /Save/i }));
    expect(onAction).toHaveBeenCalledWith({ type: "SET_ROOM_NAME", clientId: "c1", name: "My Table" });

    // Any member may close an open table.
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: /Close room/i }));
    expect(onCloseRoom).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  it("locks renaming and hides Close for a non-host in a hosted room", () => {
    const state = hostedState(); // c1 hosts; c2 seated; c3 observer
    renderPanel(state, "c2"); // Bob, not the host

    expect((screen.getByLabelText("Room name") as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: /Close room/i })).toBeNull();
  });

  it("lets the host rename and close a hosted room", () => {
    const state = hostedState();
    const { onAction, onCloseRoom } = renderPanel(state, "c1");

    const nameInput = screen.getByLabelText("Room name") as HTMLInputElement;
    expect(nameInput.disabled).toBe(false);
    fireEvent.change(nameInput, { target: { value: "Hosted Table" } });
    fireEvent.click(within(nameInput.closest(".roomTitleRow") as HTMLElement).getByRole("button", { name: /Save/i }));
    expect(onAction).toHaveBeenCalledWith({ type: "SET_ROOM_NAME", clientId: "c1", name: "Hosted Table" });

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: /Close room/i }));
    expect(onCloseRoom).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("Browse rooms returns to the lobby", () => {
    let state = createAdventureGameState({ seed: "browse", difficulty: "normal", rollFirstPlayer: false });
    state = applyAction(state, { type: "JOIN_ROOM", clientId: "c1", name: "Solo" }).state;
    const { onBrowseRooms } = renderPanel(state, "c1");
    fireEvent.click(screen.getByRole("button", { name: /Browse rooms/i }));
    expect(onBrowseRooms).toHaveBeenCalledTimes(1);
  });

  it("a non-host SET_ROOM_NAME is rejected by the engine (UI matches rules)", () => {
    const state = hostedState();
    // The host can rename; a seated non-host cannot.
    expect(applyAction(state, { type: "SET_ROOM_NAME", clientId: "c1", name: "OK" }).errors).toHaveLength(0);
    expect(
      applyAction(state, { type: "SET_ROOM_NAME", clientId: "c2", name: "Nope" }).errors.length
    ).toBeGreaterThan(0);
  });
});

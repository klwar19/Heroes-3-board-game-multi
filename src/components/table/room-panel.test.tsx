// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoomPanel } from "./room-panel";
import {
  applyAction,
  createAdventureGameState,
  createAdventureLobbyState,
  type GameAction,
  type GameState
} from "@/engine";
import type { PresenceEntry } from "@/lib/lobby-presence-client";

// The panel polls live presence to decide when the host is gone. Default: no
// presence data (the async resolve lands AFTER the synchronous body of every
// legacy test, so those are untouched); host-recovery tests set it explicitly
// and await the resolve.
let presenceReturn: PresenceEntry[] = [];
vi.mock("@/lib/lobby-presence-client", () => ({
  fetchPresence: vi.fn(async () => presenceReturn)
}));
vi.mock("@/lib/lobby-chat-client", () => ({ postLobbyChat: vi.fn(async () => {}) }));
vi.mock("@/lib/lobby-invites-client", () => ({ sendLobbyInvite: vi.fn(async () => ({ id: "inv-1" })) }));

afterEach(() => {
  cleanup();
  presenceReturn = [];
});

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

  it("labels guests only when accounts are ON (never when accounts are off)", () => {
    // Accounts OFF: everyone is technically a guest (no userId), but the UI
    // must NOT prefix every name with "guest —" — that was the mix-up users saw.
    const prev = process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED;
    delete process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED;
    try {
      const state = hostedState();
      // Stamp one member as a verified account so the ON case can diverge.
      const bob = state.room?.members.find((m) => m.clientId === "c2");
      if (bob) {
        bob.userId = "u_bob";
      }
      renderPanel(state, "c1");
      expect(screen.getByText("Alice")).toBeTruthy();
      expect(screen.getByText("Bob")).toBeTruthy();
      expect(screen.queryByText(/guest —/)).toBeNull();
      cleanup();

      process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = "1";
      renderPanel(state, "c1");
      // Alice has no userId → guest label; Bob is verified → plain nickname.
      expect(screen.getByText(/guest — Alice/)).toBeTruthy();
      expect(screen.getByText("Bob")).toBeTruthy();
      expect(screen.queryByText(/guest — Bob/)).toBeNull();
    } finally {
      if (prev === undefined) {
        delete process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED;
      } else {
        process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = prev;
      }
      cleanup();
    }
  });

  it("offers the verified-accounts lock ONLY with accounts enabled (Phase 2)", () => {
    // Control: with accounts OFF (the default), the guest deployment has no
    // verified identity to require, so the toggle is never shown.
    const state = hostedState();
    const { onAction: offAction } = renderPanel(state, "c1");
    expect(screen.queryByRole("button", { name: /Require verified accounts/i })).toBeNull();
    offAction.mockClear();
    cleanup();

    // With accounts ON, the host sees the lock and it dispatches the action.
    const prev = process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED;
    process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = "1";
    try {
      const { onAction } = renderPanel(hostedState(), "c1");
      fireEvent.click(screen.getByRole("button", { name: /Require verified accounts/i }));
      expect(onAction).toHaveBeenCalledWith({ type: "SET_ROOM_REQUIRE_AUTH", clientId: "c1", requireAuth: true });
    } finally {
      process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = prev;
    }
  });
});

describe("RoomPanel — hosted (a seated player's view)", () => {
  it("gives a non-host a self-serve seat select on their OWN row only, and no kick", () => {
    const state = hostedState();
    renderPanel(state, "c2"); // Bob, seated at p1, not host

    expect(screen.queryByTitle(/Remove/i)).toBeNull();
    // Bob's own row carries a self-serve seat select…
    const bobRow = screen.getByText("Bob").closest("li") as HTMLElement;
    expect(within(bobRow).getByRole("combobox")).toBeTruthy();
    // …but he cannot control anyone else — their rows are read-only badges.
    const caraRow = screen.getByText("Cara").closest("li") as HTMLElement;
    expect(within(caraRow).queryByRole("combobox")).toBeNull();
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
  });

  it("a non-host taking an open seat fires a SELF-targeted ASSIGN_SEAT the engine accepts", () => {
    const state = hostedState(); // Bob at p1; p2 is open
    const { onAction } = renderPanel(state, "c2");
    const bobRow = screen.getByText("Bob").closest("li") as HTMLElement;
    fireEvent.change(within(bobRow).getByRole("combobox"), { target: { value: "p2" } });
    const action: GameAction = { type: "ASSIGN_SEAT", clientId: "c2", targetClientId: "c2", seat: "p2" };
    expect(onAction).toHaveBeenCalledWith(action);
    // And the engine accepts a player claiming their own open seat.
    expect(applyAction(state, action).errors).toHaveLength(0);
  });

  it("a GUEST OBSERVER can self-serve into the open seat (the reported 'join → no role' case)", () => {
    const state = hostedState(); // Cara (c3) is an observer; p2 is open, p1 taken by Bob
    const { onAction } = renderPanel(state, "c3");
    const caraRow = screen.getByText("Cara").closest("li") as HTMLElement;
    const select = within(caraRow).getByRole("combobox") as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((option) => option.value);
    // The open p2 is offered; the taken p1 is NOT (only the host can move people).
    expect(optionValues).toContain("p2");
    expect(optionValues).not.toContain("p1");
    fireEvent.change(select, { target: { value: "p2" } });
    const action: GameAction = { type: "ASSIGN_SEAT", clientId: "c3", targetClientId: "c3", seat: "p2" };
    expect(onAction).toHaveBeenCalledWith(action);
    expect(applyAction(state, action).errors).toHaveLength(0);
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

describe("RoomPanel — shows each member's town + hero pick", () => {
  it("a seated member shows their hero · town beneath their name", () => {
    const state = hostedState(); // Bob (c2) seated at p1 = Catherine of Castle
    renderPanel(state, "c2"); // seated player's view: badges, no selects
    const bobRow = screen.getByText("Bob").closest("li") as HTMLElement;
    expect(within(bobRow).getByText("Catherine · Castle")).toBeTruthy();
  });

  it("an observer shows no hero·town pick line", () => {
    const state = hostedState(); // Cara (c3) is an observer
    renderPanel(state, "c2");
    const caraRow = screen.getByText("Cara").closest("li") as HTMLElement;
    expect(within(caraRow).queryByText(/·/)).toBeNull();
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

    // Anyone may close an open table (here, a member does).
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

describe("RoomPanel — host recovery when the host is gone", () => {
  it("offers a member 'Take over host' + 'Close room' once the host has no live presence", async () => {
    // c1 hosts (and holds seat p1 in hostedState — via c2); the ghost host c1 is
    // NOT in the live presence set, only the two other members are.
    const state = hostedState();
    presenceReturn = [
      { clientId: "c2", name: "Bob", verified: false, roomId: "abc123" },
      { clientId: "c3", name: "Cara", verified: false, roomId: "abc123" }
    ];
    // View as c3 (an observer member) — the returning/other member.
    const { onAction, onCloseRoom } = renderPanel(state, "c3");

    const reclaim = await screen.findByRole("button", { name: /Take over host/i });
    fireEvent.click(reclaim);
    expect(onAction).toHaveBeenCalledWith({ type: "RECLAIM_HOST", clientId: "c3" });

    // The member may also delete the abandoned room (server re-checks the host).
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: /Close room/i }));
    expect(onCloseRoom).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("CONTROL: a live host means no recovery controls for a member", async () => {
    const state = hostedState();
    // The host c1 IS live — recovery must not be offered.
    presenceReturn = [
      { clientId: "c1", name: "Alice", verified: false, roomId: "abc123" },
      { clientId: "c3", name: "Cara", verified: false, roomId: "abc123" }
    ];
    renderPanel(state, "c3");
    // Let the presence poll resolve, then assert the reclaim control never shows.
    await screen.findByText(/Cara/i);
    expect(screen.queryByRole("button", { name: /Take over host/i })).toBeNull();
    // A non-host member with a present host also gets no Close button.
    expect(screen.queryByRole("button", { name: /Close room/i })).toBeNull();
  });
});

/**
 * CO-OP (step 6) — the room roster's honest surfaces. A COMPUTER seat holds no
 * room member, so it never gets a roster row, but it IS in `turnOrder` and so
 * appeared in both seat dropdowns as a nameless option `assignSeat` then
 * refused. Both claims derive from `state.controllers`, never from a name.
 */
describe("RoomPanel — computer seats and the co-op ranked note", () => {
  /** A hosted 3-seat game whose third seat (p3) is computer-controlled. */
  function withComputerSeat(): GameState {
    let state = createAdventureGameState({
      seed: "room-panel-computer",
      difficulty: "normal",
      rollFirstPlayer: false,
      scenarioId: "skirmish",
      players: [
        { id: "p1", name: "Player 1", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "Player 2", factionId: "rampart", heroDefId: "mephala" },
        { id: "p3", name: "Computer 1", factionId: "necropolis", heroDefId: "sandro" }
      ],
      controllers: { p3: { kind: "computer", difficulty: "standard", policyVersion: 1 } }
    });
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

  it("labels a computer seat '(Computer)' and DISABLES it in the host's seat dropdown", () => {
    const state = withComputerSeat();
    expect(state.controllers?.p3, "the fixture must really hold a computer seat").toMatchObject({
      kind: "computer"
    });
    renderPanel(state, "c1");

    const select = screen.getByLabelText("Seat for Bob") as HTMLSelectElement;
    const computer = Array.from(select.options).find((option) => option.value === "p3")!;
    expect(computer.textContent).toContain("(Computer)");
    expect(computer.disabled).toBe(true);
    // CONTROL: a human seat in the SAME dropdown is neither labelled nor disabled.
    const human = Array.from(select.options).find((option) => option.value === "p2")!;
    expect(human.textContent).not.toContain("(Computer)");
    expect(human.disabled).toBe(false);
  });

  it("does the same in a NON-host member's own self-seating dropdown", () => {
    const state = withComputerSeat();
    renderPanel(state, "c3");
    const select = screen.getByLabelText("Your seat") as HTMLSelectElement;
    const computer = Array.from(select.options).find((option) => option.value === "p3")!;
    expect(computer.disabled).toBe(true);
    expect(computer.textContent).toContain("(Computer)");
  });

  it("CONTROL: an all-human room has no '(Computer)' option anywhere", () => {
    renderPanel(hostedState(), "c1");
    const select = screen.getByLabelText("Seat for Bob") as HTMLSelectElement;
    for (const option of Array.from(select.options)) {
      expect(option.textContent).not.toContain("(Computer)");
      expect(option.disabled).toBe(false);
    }
  });

  it("says a co-op table is UNRANKED (clash CONTROL: no note)", () => {
    const state = hostedState();
    state.gameMode = "coop";
    // The room's own ranked flag is a create-time leftover; the note is honest
    // regardless of it, because `detectFinishedMatch` nulls a co-op game out.
    state.room!.ranked = true;
    renderPanel(state, "c1");
    expect(screen.getByText(/Unranked: this table never counts toward MMR/i)).toBeTruthy();

    cleanup();
    const clash = hostedState();
    clash.room!.ranked = true;
    renderPanel(clash, "c1");
    expect(screen.queryByText(/Unranked: this table never counts toward MMR/i)).toBeNull();
  });

  it("names configured mixed teams instead of claiming every computer is an enemy", () => {
    const state = hostedState();
    state.gameMode = "coop";
    state.playerTeams = { p1: "setup-team-1", p2: "setup-team-1" };
    renderPanel(state, "c1");
    expect(screen.getByText(/custom player\/computer teams/i)).toBeTruthy();
    expect(screen.queryByText(/humans vs the computer enemies/i)).toBeNull();
  });

  it("reads the mode off the SETUP LOBBY too, before the game is built", () => {
    let state = createAdventureLobbyState({ seed: "room-panel-coop-lobby", scenarioId: "skirmish" });
    state = applyAction(state, { type: "JOIN_ROOM", clientId: "c1", name: "Alice" }).state;
    state = applyAction(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { gameMode: "coop" }
    }).state;
    expect(state.gameMode, "a lobby has not frozen the mode yet").toBeUndefined();
    renderPanel(state, "c1");
    expect(screen.getByText(/Unranked: this table never counts toward MMR/i)).toBeTruthy();
  });
});

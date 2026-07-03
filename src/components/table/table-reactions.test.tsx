// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TableReactionBar, TableReactionOverlay, TableReactionsLayer } from "./table-reactions";
import { applyAction, createAdventureGameState, type GameState, type TableReaction } from "@/engine";

afterEach(cleanup);

function reaction(overrides: Partial<TableReaction> & { seq: number }): TableReaction {
  return {
    clientId: "c1",
    name: "Alice",
    reactionId: "greet",
    seat: null,
    factionId: null,
    ...overrides
  };
}

describe("TableReactionBar", () => {
  it("opens the palette and dispatches the picked reaction, then cools down", () => {
    vi.useFakeTimers();
    try {
      const onSend = vi.fn();
      render(<TableReactionBar onSend={onSend} />);

      // Palette is closed until the toggle is pressed.
      expect(screen.queryByRole("menu")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: /send a table reaction/i }));

      const greet = screen.getByRole("menuitem", { name: /greetings/i });
      fireEvent.click(greet);
      expect(onSend).toHaveBeenCalledTimes(1);
      expect(onSend).toHaveBeenCalledWith("greet");

      // Sending closes the palette and starts a cooldown: reopening shows the
      // options disabled until the cooldown elapses.
      fireEvent.click(screen.getByRole("button", { name: /send a table reaction/i }));
      expect((screen.getByRole("menuitem", { name: /greetings/i }) as HTMLButtonElement).disabled).toBe(true);

      act(() => {
        vi.advanceTimersByTime(1200);
      });
      expect((screen.getByRole("menuitem", { name: /greetings/i }) as HTMLButtonElement).disabled).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("TableReactionOverlay", () => {
  it("shows a bubble for a reaction that arrives after mount, not for history", () => {
    // History present at mount must not flood the screen.
    const { rerender } = render(<TableReactionOverlay reactions={[reaction({ seq: 3, name: "Old" })]} />);
    expect(screen.queryByRole("status")).toBeNull();

    // A newer reaction (seq 4) arriving after mount pops a bubble.
    rerender(
      <TableReactionOverlay
        reactions={[reaction({ seq: 3, name: "Old" }), reaction({ seq: 4, name: "Bob", reactionId: "wow" })]}
      />
    );
    const bubble = screen.getByRole("status");
    expect(bubble.textContent).toContain("Bob");
    expect(bubble.textContent).toContain("By the gods!");
  });

  it("renders the sender's authentic faction crest on the bubble", () => {
    const { rerender } = render(<TableReactionOverlay reactions={[]} />);
    rerender(
      <TableReactionOverlay reactions={[reaction({ seq: 1, name: "Necro", seat: "p1", factionId: "necropolis" })]} />
    );
    const crest = screen.getByRole("status").querySelector("img");
    expect(crest?.getAttribute("src")).toContain("town-icon-necropolis.webp");
  });

  it("fades a bubble out after its lifetime elapses", () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(<TableReactionOverlay reactions={[]} />);
      rerender(<TableReactionOverlay reactions={[reaction({ seq: 1 })]} />);
      expect(screen.getByRole("status")).toBeTruthy();

      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.queryByRole("status")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("TableReactionsLayer", () => {
  function stateWithMembers(count: number): GameState {
    let state = createAdventureGameState({ seed: "layer", difficulty: "normal", rollFirstPlayer: false });
    for (let i = 0; i < count; i += 1) {
      state = applyAction(state, { type: "JOIN_ROOM", clientId: `c${i}`, name: `P${i}` }).state;
    }
    return state;
  }

  it("shows the reaction bar only at a multiplayer table (2+ members)", () => {
    const { rerender } = render(<TableReactionsLayer state={stateWithMembers(1)} onSend={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /send a table reaction/i })).toBeNull();

    rerender(<TableReactionsLayer state={stateWithMembers(2)} onSend={vi.fn()} />);
    expect(screen.getByRole("button", { name: /send a table reaction/i })).toBeTruthy();
  });

  it("routes a picked reaction through onSend", () => {
    const onSend = vi.fn();
    render(<TableReactionsLayer state={stateWithMembers(2)} onSend={onSend} />);
    fireEvent.click(screen.getByRole("button", { name: /send a table reaction/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /amazed/i }));
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("wow");
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatPanel } from "./chat-panel";
import { appendSystemChat, applyAction, createAdventureGameState, type GameAction, type GameState } from "@/engine";

afterEach(cleanup);

function ok(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors.map((error) => error.message).join("; ")).toBe("");
  return result.state;
}

/** A table with me (clientId "me") + Bob (c2), plus any seeded chat lines. */
function tableWith(lines: { clientId: string; text: string }[] = []): GameState {
  let state = createAdventureGameState({ seed: "chat-ui", difficulty: "normal", rollFirstPlayer: false });
  state = ok(state, { type: "JOIN_ROOM", clientId: "me", name: "Me" });
  state = ok(state, { type: "JOIN_ROOM", clientId: "c2", name: "Bob" });
  for (const line of lines) {
    state = ok(state, { type: "SEND_CHAT", clientId: line.clientId, text: line.text });
  }
  return state;
}

describe("ChatPanel", () => {
  it("renders nothing when there is no room (solo / pre-join)", () => {
    const solo = createAdventureGameState({ seed: "solo", difficulty: "normal", rollFirstPlayer: false });
    const { container } = render(<ChatPanel state={solo} clientId="me" onSend={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("starts collapsed as a FAB and opens the panel on click", () => {
    render(<ChatPanel state={tableWith()} clientId="me" onSend={vi.fn()} />);
    // Collapsed: no composer input yet.
    expect(screen.queryByLabelText(/chat message/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /chat/i }));
    // Open: the composer appears.
    expect(screen.getByLabelText(/chat message/i)).toBeTruthy();
  });

  it("closes on Escape from anywhere in the panel (e.g. the composer input)", () => {
    render(<ChatPanel state={tableWith()} clientId="me" onSend={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /chat/i }));
    const input = screen.getByLabelText(/chat message/i);
    // A non-Escape key leaves it open (the control).
    fireEvent.keyDown(input, { key: "a" });
    expect(screen.getByLabelText(/chat message/i)).toBeTruthy();
    fireEvent.keyDown(input, { key: "Escape" });
    // Collapsed again: the composer is gone, the FAB is back.
    expect(screen.queryByLabelText(/chat message/i)).toBeNull();
    expect(screen.getByRole("button", { name: /chat/i })).toBeTruthy();
  });

  it("shows existing messages with their author names and text", () => {
    const state = tableWith([
      { clientId: "c2", text: "Well met." },
      { clientId: "me", text: "Likewise." }
    ]);
    render(<ChatPanel state={state} clientId="me" onSend={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /chat/i }));
    expect(screen.getByText("Well met.")).toBeTruthy();
    expect(screen.getByText("Likewise.")).toBeTruthy();
    expect(screen.getByText("Bob")).toBeTruthy();
  });

  it("dispatches the typed message and clears the input (control: empty is not sendable)", () => {
    const onSend = vi.fn();
    render(<ChatPanel state={tableWith()} clientId="me" onSend={onSend} />);
    fireEvent.click(screen.getByRole("button", { name: /chat/i }));

    const input = screen.getByLabelText(/chat message/i) as HTMLInputElement;
    const send = screen.getByRole("button", { name: /send message/i }) as HTMLButtonElement;

    // Control: empty (and whitespace-only) can't be sent.
    expect(send.disabled).toBe(true);
    fireEvent.change(input, { target: { value: "   " } });
    expect(send.disabled).toBe(true);
    expect(onSend).not.toHaveBeenCalled();

    // Real text sends, trimmed, and clears the field.
    fireEvent.change(input, { target: { value: "  hello table  " } });
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("hello table");
    expect(input.value).toBe("");
  });

  it("styles my own lines distinctly from others", () => {
    const state = tableWith([
      { clientId: "me", text: "mine here" },
      { clientId: "c2", text: "theirs here" }
    ]);
    render(<ChatPanel state={state} clientId="me" onSend={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /chat/i }));
    expect(screen.getByText("mine here").closest(".chatLine")?.className).toMatch(/\bmine\b/);
    expect(screen.getByText("theirs here").closest(".chatLine")?.className).not.toMatch(/\bmine\b/);
  });

  it("renders a system notice without an author", () => {
    const state = tableWith([{ clientId: "c2", text: "hi" }]);
    appendSystemChat(state, "Bob left the table", { force: true });
    render(<ChatPanel state={state} clientId="me" onSend={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /chat/i }));
    const systemLine = screen.getByText("Bob left the table");
    expect(systemLine.className).toMatch(/chatSystemLine/);
  });

  it("badges unread lines from others while collapsed, but adopts history silently", () => {
    // Mount collapsed with history — no badge for what was said before arrival.
    const initial = tableWith([{ clientId: "c2", text: "before you arrived" }]);
    const { rerender, container } = render(<ChatPanel state={initial} clientId="me" onSend={vi.fn()} />);
    expect(container.querySelector(".chatBadge")).toBeNull();

    // A new line from another client while collapsed → a badge appears.
    const withNew = ok(initial, { type: "SEND_CHAT", clientId: "c2", text: "psst, new" });
    rerender(<ChatPanel state={withNew} clientId="me" onSend={vi.fn()} />);
    expect(container.querySelector(".chatBadge")?.textContent).toBe("1");

    // Control: my OWN new line does not raise the unread badge.
    const withMine = ok(withNew, { type: "SEND_CHAT", clientId: "me", text: "just me" });
    rerender(<ChatPanel state={withMine} clientId="me" onSend={vi.fn()} />);
    expect(container.querySelector(".chatBadge")?.textContent).toBe("1");
  });
});

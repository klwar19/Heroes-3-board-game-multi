// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatPanel } from "./chat-panel";
import { appendSystemChat, applyAction, createAdventureGameState, type GameAction, type GameState } from "@/engine";

vi.mock("@/lib/sound", () => ({
  playTableChatMessage: vi.fn()
}));

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

/** The dock starts collapsed everywhere now; open it from the FAB. */
function openChat(): void {
  fireEvent.click(screen.getByRole("button", { name: /chat/i }));
}

describe("ChatPanel", () => {
  it("renders nothing when there is no room (solo / pre-join)", () => {
    const solo = createAdventureGameState({ seed: "solo", difficulty: "normal", rollFirstPlayer: false });
    const { container } = render(<ChatPanel state={solo} clientId="me" onSend={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("starts COLLAPSED as a FAB everywhere; opens from the FAB and minimizes back", () => {
    render(<ChatPanel state={tableWith()} clientId="me" onSend={vi.fn()} />);
    // Collapsed by default: the composer is NOT mounted, only the FAB.
    expect(screen.queryByLabelText(/chat message/i)).toBeNull();
    expect(screen.getByRole("button", { name: /chat/i })).toBeTruthy();
    // Open from the FAB.
    openChat();
    expect(screen.getByLabelText(/chat message/i)).toBeTruthy();
    // Minimize back to a FAB.
    fireEvent.click(screen.getByRole("button", { name: /minimize chat/i }));
    expect(screen.queryByLabelText(/chat message/i)).toBeNull();
    expect(screen.getByRole("button", { name: /chat/i })).toBeTruthy();
  });

  it("minimizes on Escape from anywhere in the panel (e.g. the composer input)", () => {
    render(<ChatPanel state={tableWith()} clientId="me" onSend={vi.fn()} />);
    openChat();
    const input = screen.getByLabelText(/chat message/i);
    // A non-Escape key leaves it open (the control).
    fireEvent.keyDown(input, { key: "a" });
    expect(screen.getByLabelText(/chat message/i)).toBeTruthy();
    fireEvent.keyDown(input, { key: "Escape" });
    // Minimized: the composer is gone, the FAB is back.
    expect(screen.queryByLabelText(/chat message/i)).toBeNull();
    expect(screen.getByRole("button", { name: /chat/i })).toBeTruthy();
  });

  it("shows existing messages with their author names and text", () => {
    const state = tableWith([
      { clientId: "c2", text: "Well met." },
      { clientId: "me", text: "Likewise." }
    ]);
    render(<ChatPanel state={state} clientId="me" onSend={vi.fn()} />);
    openChat();
    expect(screen.getByText("Well met.")).toBeTruthy();
    expect(screen.getByText("Likewise.")).toBeTruthy();
    expect(screen.getByText("Bob")).toBeTruthy();
  });

  it("dispatches the typed message and clears the input (control: empty is not sendable)", () => {
    const onSend = vi.fn();
    render(<ChatPanel state={tableWith()} clientId="me" onSend={onSend} />);
    openChat();

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
    openChat();
    expect(screen.getByText("mine here").closest(".chatLine")?.className).toMatch(/\bmine\b/);
    expect(screen.getByText("theirs here").closest(".chatLine")?.className).not.toMatch(/\bmine\b/);
  });

  it("renders a system notice without an author", () => {
    const state = tableWith([{ clientId: "c2", text: "hi" }]);
    appendSystemChat(state, "Bob left the table", { force: true });
    render(<ChatPanel state={state} clientId="me" onSend={vi.fn()} />);
    openChat();
    const systemLine = screen.getByText("Bob left the table");
    expect(systemLine.className).toMatch(/chatSystemLine/);
  });

  it("badges unread lines from others while minimized, but adopts history silently", () => {
    // Mount COLLAPSED with history — no badge for what was already seen.
    const initial = tableWith([{ clientId: "c2", text: "before you arrived" }]);
    const { rerender, container } = render(<ChatPanel state={initial} clientId="me" onSend={vi.fn()} />);
    expect(container.querySelector(".chatBadge")).toBeNull();

    // A new line from another client while minimized → a badge appears.
    const withNew = ok(initial, { type: "SEND_CHAT", clientId: "c2", text: "psst, new" });
    rerender(<ChatPanel state={withNew} clientId="me" onSend={vi.fn()} />);
    expect(container.querySelector(".chatBadge")?.textContent).toBe("1");

    // Control: my OWN new line does not raise the unread badge.
    const withMine = ok(withNew, { type: "SEND_CHAT", clientId: "me", text: "just me" });
    rerender(<ChatPanel state={withMine} clientId="me" onSend={vi.fn()} />);
    expect(container.querySelector(".chatBadge")?.textContent).toBe("1");
  });

  it("shows a preview toast and FAB snippet for a new line while minimized", () => {
    const initial = tableWith([{ clientId: "c2", text: "old" }]);
    const { rerender, container } = render(<ChatPanel state={initial} clientId="me" onSend={vi.fn()} />);

    const withNew = ok(initial, { type: "SEND_CHAT", clientId: "c2", text: "Hello from Bob" });
    rerender(<ChatPanel state={withNew} clientId="me" onSend={vi.fn()} />);

    expect(container.querySelector(".chatPreviewToast")).toBeTruthy();
    expect(screen.getByText("Hello from Bob")).toBeTruthy();
    expect(container.querySelector(".chatFabSnippet")?.textContent).toMatch(/Bob/i);
    expect(container.querySelector(".chatFabSnippet")?.textContent).toMatch(/Hello from Bob/i);
  });

  it("shows a New messages divider when reopening with unread", () => {
    const initial = tableWith([{ clientId: "c2", text: "already seen" }]);
    const { rerender } = render(<ChatPanel state={initial} clientId="me" onSend={vi.fn()} />);

    const withNew = ok(initial, { type: "SEND_CHAT", clientId: "c2", text: "fresh line" });
    rerender(<ChatPanel state={withNew} clientId="me" onSend={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /chat/i }));
    expect(screen.getByText("New messages")).toBeTruthy();
    expect(screen.getByText("fresh line")).toBeTruthy();
  });

  it("reopens from the preview toast click", () => {
    const initial = tableWith();
    const { rerender } = render(<ChatPanel state={initial} clientId="me" onSend={vi.fn()} />);
    const withNew = ok(initial, { type: "SEND_CHAT", clientId: "c2", text: "open me" });
    rerender(<ChatPanel state={withNew} clientId="me" onSend={vi.fn()} />);

    fireEvent.click(screen.getByText("open me"));
    expect(screen.getByLabelText(/chat message/i)).toBeTruthy();
  });
});

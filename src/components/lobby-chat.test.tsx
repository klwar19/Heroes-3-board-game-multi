// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LobbyChat } from "./lobby-chat";
import type { LobbyChatMessage } from "@/server/lobby-chat";

afterEach(cleanup);

function msg(seq: number, over: Partial<LobbyChatMessage> = {}): LobbyChatMessage {
  return { seq, clientId: "c2", name: "Bob", text: `line ${seq}`, at: 1000, ...over };
}

describe("LobbyChat", () => {
  it("shows an empty state when there are no messages", () => {
    render(<LobbyChat clientId="me" messages={[]} onSend={vi.fn()} />);
    expect(screen.getByText(/say hello to the lobby/i)).toBeTruthy();
  });

  it("renders messages with author and text", () => {
    render(
      <LobbyChat
        clientId="me"
        messages={[msg(1, { name: "Bob", text: "Well met" }), msg(2, { clientId: "me", name: "Me", text: "Hi" })]}
        onSend={vi.fn()}
      />
    );
    expect(screen.getByText("Well met")).toBeTruthy();
    expect(screen.getByText("Bob")).toBeTruthy();
    expect(screen.getByText("Hi")).toBeTruthy();
  });

  it("sends trimmed text and clears the field (control: empty is not sendable)", () => {
    const onSend = vi.fn();
    render(<LobbyChat clientId="me" messages={[]} onSend={onSend} />);
    const input = screen.getByLabelText("Lobby message") as HTMLInputElement;
    const send = screen.getByRole("button", { name: /send lobby message/i }) as HTMLButtonElement;

    expect(send.disabled).toBe(true);
    fireEvent.change(input, { target: { value: "  hello lobby  " } });
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    expect(onSend).toHaveBeenCalledWith("hello lobby");
    expect(input.value).toBe("");
  });

  it("styles my own lines distinctly and surfaces an error", () => {
    render(
      <LobbyChat
        clientId="me"
        messages={[msg(1, { clientId: "me", text: "mine" }), msg(2, { clientId: "c2", text: "theirs" })]}
        error="Slow down — too many messages at once."
        onSend={vi.fn()}
      />
    );
    expect(screen.getByText("mine").closest(".lobbyChatLine")?.className).toMatch(/\bmine\b/);
    expect(screen.getByText("theirs").closest(".lobbyChatLine")?.className).not.toMatch(/\bmine\b/);
    expect(screen.getByText(/slow down/i)).toBeTruthy();
  });
});

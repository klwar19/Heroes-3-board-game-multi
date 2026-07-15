// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INVITE_POLL_MS, InvitePopup } from "./invite-popup";
import * as invitesClient from "@/lib/lobby-invites-client";

vi.mock("@/lib/lobby-invites-client", () => ({
  fetchLobbyInvites: vi.fn(),
  dismissLobbyInvite: vi.fn().mockResolvedValue(undefined)
}));

function setVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });
}

beforeEach(() => {
  vi.mocked(invitesClient.fetchLobbyInvites).mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  setVisibility("visible");
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("InvitePopup — invite polling stops in hidden tabs (edge-request leak fix)", () => {
  // Mounted in the lobby AND on the in-game page, this poll runs for whole
  // play sessions; each tick is a billed same-origin edge request on the
  // production host, so hidden tabs must spend nothing.
  it("skips interval ticks while hidden and refreshes instantly on tab focus", async () => {
    vi.useFakeTimers();
    render(<InvitePopup clientId="c1" onJoinRoom={() => {}} />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(invitesClient.fetchLobbyInvites).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    await act(() => vi.advanceTimersByTimeAsync(INVITE_POLL_MS * 3));
    expect(invitesClient.fetchLobbyInvites).toHaveBeenCalledTimes(1);

    setVisibility("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(invitesClient.fetchLobbyInvites).toHaveBeenCalledTimes(2);
  });

  it("CONTROL: a visible tab keeps polling, and a delivered invite pops", async () => {
    vi.useFakeTimers();
    render(<InvitePopup clientId="c1" onJoinRoom={() => {}} />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(invitesClient.fetchLobbyInvites).toHaveBeenCalledTimes(1);

    vi.mocked(invitesClient.fetchLobbyInvites).mockResolvedValue([
      {
        id: "inv-1",
        fromClientId: "c2",
        fromName: "Alice",
        toClientId: "c1",
        roomId: "room-9",
        roomName: "Border Skirmish",
        at: 0
      } as never
    ]);
    await act(() => vi.advanceTimersByTimeAsync(INVITE_POLL_MS));
    expect(invitesClient.fetchLobbyInvites).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/invites you to join/i)).toBeTruthy();
  });
});

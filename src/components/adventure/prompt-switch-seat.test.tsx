// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PromptTray } from "./screen";
import { createAdventureGameState } from "@/engine";
import type { GameState } from "@/engine";

afterEach(cleanup);

/**
 * The open-table "Play as X" jump on the "…is deciding" strip. It lets whoever
 * must act reach a MAP choice they own from any seat, in ONE click, without the
 * invasive auto-switching. It appears only for a real seat, only on the map
 * (never mid-combat), and only when a switch handler is supplied (open tables).
 */
function mapChoiceOwnedBy(owner: string): GameState {
  const state = createAdventureGameState({ seed: "prompt-switch", rollFirstPlayer: false });
  state.combat = null;
  state.pendingChoice = {
    id: "c1",
    type: "OPTION_CHOICE",
    playerId: owner,
    prompt: "This Far tile has a Blocked Field — place a Creature Bank token here?",
    options: [{ label: "Place a Creature Bank" }, { label: "Leave it blocked" }],
    context: "place-creature-bank",
    creatureBank: { fieldId: "f1", tier: "far" },
    returnPhase: state.phase
  } as GameState["pendingChoice"];
  return state;
}

describe("PromptTray — open-table 'Play as X' jump", () => {
  it("offers a one-click switch to the choice owner when viewing another seat", () => {
    const state = mapChoiceOwnedBy("p2");
    const onSwitchSeat = vi.fn();
    render(
      <PromptTray
        legalActions={[]}
        onAction={vi.fn()}
        onSwitchSeat={onSwitchSeat}
        state={state}
        viewerPlayerId="p1"
      />
    );
    const jump = screen.getByRole("button", { name: /Play as/ });
    fireEvent.click(jump);
    expect(onSwitchSeat).toHaveBeenCalledWith("p2");
  });

  it("does NOT offer the jump with no switch handler (hosted room: seat is fixed)", () => {
    const state = mapChoiceOwnedBy("p2");
    render(<PromptTray legalActions={[]} onAction={vi.fn()} state={state} viewerPlayerId="p1" />);
    expect(screen.queryByRole("button", { name: /Play as/ })).toBeNull();
    // The waiting strip still names the owner.
    expect(screen.getByText(/is deciding/i)).toBeTruthy();
  });

  it("does NOT offer the jump mid-combat (switching seats in a fight is disorienting)", () => {
    const state = mapChoiceOwnedBy("p2");
    state.combat = { id: "x" } as GameState["combat"];
    render(
      <PromptTray legalActions={[]} onAction={vi.fn()} onSwitchSeat={vi.fn()} state={state} viewerPlayerId="p1" />
    );
    expect(screen.queryByRole("button", { name: /Play as/ })).toBeNull();
  });
});

/**
 * Round-start Event-deck / Astrologers steps (and every location visit) surface
 * as `adventure.pendingVisit`, NOT as `state.pendingChoice` — and the round-
 * start Event barrier freezes every other seat while one is open. Before this
 * strip existed, a visit owned by another seat rendered NOTHING here: on an
 * open/hotseat table the event looked unresolvable and the whole table read as
 * frozen. Same for the pendingTileChoice (round 1's forced home-tile spins).
 */
function visitOwnedBy(owner: string, eventBarrier: boolean): GameState {
  const state = createAdventureGameState({ seed: "prompt-switch", rollFirstPlayer: false });
  state.combat = null;
  state.pendingChoice = null;
  state.adventure!.pendingVisit = {
    heroId: "h1",
    playerId: owner,
    fieldId: "f1",
    steps: [{ type: "CHOOSE_ONE", prompt: "Crypt: choose one option", options: [] }]
  } as NonNullable<GameState["adventure"]>["pendingVisit"];
  if (eventBarrier) {
    state.adventure!.eventResolution = { round: state.round };
  }
  return state;
}

describe("PromptTray — another seat's visit / tile rotation is never invisible", () => {
  it("names the visit owner and offers the one-click jump (event barrier up)", () => {
    const state = visitOwnedBy("p2", true);
    const onSwitchSeat = vi.fn();
    render(
      <PromptTray legalActions={[]} onAction={vi.fn()} onSwitchSeat={onSwitchSeat} state={state} viewerPlayerId="p1" />
    );
    expect(screen.getByText(/is resolving the round's Event/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Play as/ }));
    expect(onSwitchSeat).toHaveBeenCalledWith("p2");
  });

  it("shows an ordinary visit strip when no event barrier is up", () => {
    const state = visitOwnedBy("p2", false);
    render(
      <PromptTray legalActions={[]} onAction={vi.fn()} onSwitchSeat={vi.fn()} state={state} viewerPlayerId="p1" />
    );
    expect(screen.getByText(/is resolving a visit/i)).toBeTruthy();
  });

  it("keeps the strip but hides the jump in a hosted room (no switch handler)", () => {
    const state = visitOwnedBy("p2", true);
    render(<PromptTray legalActions={[]} onAction={vi.fn()} state={state} viewerPlayerId="p1" />);
    expect(screen.getByText(/is resolving the round's Event/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Play as/ })).toBeNull();
  });

  it("covers another seat's tile rotation too", () => {
    const state = createAdventureGameState({ seed: "prompt-switch", rollFirstPlayer: false });
    state.combat = null;
    state.pendingChoice = null;
    state.adventure!.pendingVisit = null;
    state.adventure!.pendingTileChoice = {
      tileInstanceId: "t1",
      playerId: "p2",
      kind: "starting"
    } as NonNullable<GameState["adventure"]>["pendingTileChoice"];
    const onSwitchSeat = vi.fn();
    render(
      <PromptTray legalActions={[]} onAction={vi.fn()} onSwitchSeat={onSwitchSeat} state={state} viewerPlayerId="p1" />
    );
    expect(screen.getByText(/is rotating a new tile/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Play as/ }));
    expect(onSwitchSeat).toHaveBeenCalledWith("p2");
  });

  it("shows nothing extra for the visit OWNER's own seat (their prompt renders instead)", () => {
    const state = visitOwnedBy("p2", true);
    render(<PromptTray legalActions={[]} onAction={vi.fn()} onSwitchSeat={vi.fn()} state={state} viewerPlayerId="p2" />);
    expect(screen.queryByText(/is resolving/i)).toBeNull();
  });
});

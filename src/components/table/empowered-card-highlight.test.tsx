// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CardFrame, HandFan } from "./seats";
import { cardIsEmpoweredFor, isEmpoweredStatisticCard } from "./utils";
import { cardZoomContent } from "./zoom";
import { CardZoomProvider } from "./zoom";
import { cardLibrary } from "@/data/cards/library";
import { createInitialGameState, getLegalActions, getPlayerView, type GameState } from "@/engine";

afterEach(cleanup);

// The empowered cue must DIFFERENTIATE empowered cards from their normal
// twins, so every test pairs the empowered case with a normal CONTROL that
// must NOT light up — a glow that fires on everything (or nothing) is useless.

function handState(hand: string[], empoweredAbilities: string[] = []): GameState {
  const state = createInitialGameState("empowered-highlight");
  state.players.p1.hand = hand;
  state.players.p1.empoweredAbilities = empoweredAbilities;
  state.players.p2.hand = [];
  state.activePlayerId = "p1";
  return state;
}

function renderHand(state: GameState) {
  return render(
    <CardZoomProvider>
      <HandFan
        view={getPlayerView(state, "p1")}
        state={state}
        viewerPlayerId="p1"
        legalActions={getLegalActions(state, "p1")}
        selectedCardAction={null}
        trayActive={false}
        onSelectCardAction={() => {}}
        onAction={() => {}}
      />
    </CardZoomProvider>
  );
}

describe("empowered-card data contract", () => {
  it("flags every Empowered Statistic and no normal statistic", () => {
    // Invariant: an Empowered Statistic always carries the marker; its normal
    // twin never does. Guards every render surface at once (rule #1a.5).
    const empoweredStats = Object.values(cardLibrary).filter(
      (card) => card.kind === "statistic" && card.tags.includes("empowered")
    );
    expect(empoweredStats.length).toBeGreaterThan(0);
    for (const card of empoweredStats) {
      expect(isEmpoweredStatisticCard(card.id)).toBe(true);
    }
    expect(isEmpoweredStatisticCard("stat.attack")).toBe(false);
    expect(isEmpoweredStatisticCard("stat.knowledge")).toBe(false);
  });

  it("treats an ability as empowered only when the owner has empowered it", () => {
    expect(cardIsEmpoweredFor("ability.estates", ["ability.estates"])).toBe(true);
    // Same card, owner has NOT empowered it → not empowered (the per-owner half).
    expect(cardIsEmpoweredFor("ability.estates", [])).toBe(false);
    expect(cardIsEmpoweredFor("ability.estates", undefined)).toBe(false);
    // Statistic half still fires with no ability list at all.
    expect(cardIsEmpoweredFor("stat.attack.empowered", undefined)).toBe(true);
  });
});

describe("CardFrame — empowered highlight", () => {
  it("rings an Empowered Statistic from the card alone, but not its normal twin", () => {
    const empowered = render(<CardFrame cardId="stat.attack.empowered" className="x" />);
    expect(empowered.container.querySelector(".empoweredCard")).not.toBeNull();
    cleanup();
    const normal = render(<CardFrame cardId="stat.attack" className="x" />);
    expect(normal.container.querySelector(".empoweredCard")).toBeNull();
  });

  it("rings an ability ONLY when the empowered prop is passed (per-owner)", () => {
    const empowered = render(<CardFrame cardId="ability.estates" className="x" empowered />);
    expect(empowered.container.querySelector(".empoweredCard")).not.toBeNull();
    cleanup();
    const normal = render(<CardFrame cardId="ability.estates" className="x" />);
    expect(normal.container.querySelector(".empoweredCard")).toBeNull();
  });
});

describe("HandFan — empowered badge in the hand", () => {
  it("badges an Empowered Statistic in hand, not the normal statistic beside it", () => {
    const { container } = renderHand(handState(["stat.attack.empowered", "stat.attack"]));
    const badges = screen.getAllByText("Empowered");
    expect(badges).toHaveLength(1);
    // The ring lands on the empowered art, and only once.
    expect(container.querySelectorAll(".fanCardImage.empoweredCard")).toHaveLength(1);
  });

  it("badges an empowered ability but not the same ability when it is not empowered", () => {
    const empowered = renderHand(handState(["ability.estates"], ["ability.estates"]));
    expect(within(empowered.container).getAllByText("Empowered")).toHaveLength(1);
    cleanup();
    const control = renderHand(handState(["ability.estates"], []));
    expect(within(control.container).queryByText("Empowered")).toBeNull();
  });
});

describe("zoom — empowered cue on the read view", () => {
  it("marks an Empowered Statistic and leaves the normal statistic plain", () => {
    expect(cardZoomContent("stat.power.empowered").empowered).toBe(true);
    expect(cardZoomContent("stat.power").empowered).toBe(false);
  });
});

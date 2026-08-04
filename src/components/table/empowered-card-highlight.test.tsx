// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CardFrame, HandFan } from "./seats";
import { cardIsEmpoweredFor, isEmpoweredStatisticCard } from "./utils";
import { cardZoomContent } from "./zoom";
import { CardZoomProvider } from "./zoom";
import { cardLibrary } from "@/data/cards/library";
import { PileModal } from "@/components/adventure/screen";
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

describe("empowered card FACE — the printed Empowered scan replaces the base art", () => {
  // The wiki ships a dedicated "Empowered" scan per ability. Rendering the base
  // face with a ring on top showed the WRONG card text (the ring is a cue, not
  // the card). Every case pairs the swap with a not-empowered CONTROL that must
  // keep the base face — a swap that fires always is as wrong as one that never
  // fires.
  const src = (container: HTMLElement) =>
    container.querySelector<HTMLImageElement>("img")?.getAttribute("src") ?? "";

  it("CardFrame renders the empowered face for an empowered ability, the base face otherwise", () => {
    const empowered = render(<CardFrame cardId="ability.offense" className="x" empowered />);
    expect(src(empowered.container)).toContain("abilities-offense-empowered.webp");
    // The ring/badge wiring must survive the swap (pinned above too).
    expect(empowered.container.querySelector(".empoweredCard")).not.toBeNull();
    cleanup();
    const normal = render(<CardFrame cardId="ability.offense" className="x" />);
    expect(src(normal.container)).toContain("abilities-offense.webp");
    expect(src(normal.container)).not.toContain("empowered");
  });

  it("HandFan shows the empowered face for the owner's empowered ability only", () => {
    // The hand fan also renders chrome images (the spell-book button), so read
    // the card art specifically.
    const fanSrc = (container: HTMLElement) =>
      container.querySelector<HTMLImageElement>("img.fanCardImage")?.getAttribute("src") ?? "";
    const empowered = renderHand(handState(["ability.estates"], ["ability.estates"]));
    expect(fanSrc(empowered.container)).toContain("abilities-estates-empowered.webp");
    cleanup();
    const control = renderHand(handState(["ability.estates"], []));
    expect(fanSrc(control.container)).toContain("abilities-estates.webp");
    expect(fanSrc(control.container)).not.toContain("empowered");
  });

  it("the zoom read view swaps the face too (and only when empowered)", () => {
    expect(cardZoomContent("ability.offense", true).image).toBe(
      "/assets/abilities-offense-empowered.webp"
    );
    expect(cardZoomContent("ability.offense").image).toBe("/assets/abilities-offense.webp");
  });

  it("an Empowered Statistic already prints its own empowered face", () => {
    // Intrinsic empowered card: the swap must not double-suffix it.
    expect(cardZoomContent("stat.attack.empowered").image).toBe(
      "/assets/statistics-attack-empowered.webp"
    );
    expect(cardZoomContent("stat.attack").image).toBe("/assets/statistics-attack.webp");
  });
});

describe("PileModal — the pile browser shows the owner's empowered abilities", () => {
  // The pile browser used to know only intrinsic Empowered Statistics; an
  // Empowered ABILITY in a browsed discard pile rendered its base face with no
  // cue (user rule 2026-08-04: "MUST SHOW EMPOWERED ABILITY, WITH CORRECT
  // IMAGE"). The producers now pass the pile OWNER's empoweredAbilities.
  const pileSrc = (container: HTMLElement) =>
    container.querySelector<HTMLImageElement>(".pileCardButton img")?.getAttribute("src") ?? "";

  it("renders the empowered face + badge for an ability the pile owner empowered", () => {
    const { container } = render(
      <CardZoomProvider>
        <PileModal
          title="P1 — discard pile"
          cardIds={["ability.offense"]}
          kind="cards"
          empoweredAbilities={["ability.offense"]}
          onClose={() => {}}
        />
      </CardZoomProvider>
    );
    expect(pileSrc(container)).toContain("abilities-offense-empowered.webp");
    expect(within(container).getAllByText("Empowered")).toHaveLength(1);
  });

  it("CONTROL: the same ability in a pile whose owner did NOT empower it keeps the base face", () => {
    const { container } = render(
      <CardZoomProvider>
        <PileModal title="P1 — discard pile" cardIds={["ability.offense"]} kind="cards" onClose={() => {}} />
      </CardZoomProvider>
    );
    expect(pileSrc(container)).toContain("abilities-offense.webp");
    expect(pileSrc(container)).not.toContain("empowered");
    expect(within(container).queryByText("Empowered")).toBeNull();
  });

  it("an Empowered Statistic still flags intrinsically with no owner list (shared decks)", () => {
    const { container } = render(
      <CardZoomProvider>
        <PileModal title="Spells — discard pile" cardIds={["stat.attack.empowered"]} kind="cards" onClose={() => {}} />
      </CardZoomProvider>
    );
    expect(pileSrc(container)).toContain("statistics-attack-empowered.webp");
    expect(within(container).getAllByText("Empowered")).toHaveLength(1);
  });
});

describe("zoom — empowered cue on the read view", () => {
  it("marks an Empowered Statistic and leaves the normal statistic plain", () => {
    expect(cardZoomContent("stat.power.empowered").empowered).toBe(true);
    expect(cardZoomContent("stat.power").empowered).toBe(false);
  });

  it("marks an empowered ABILITY only when the owner's flag is threaded in", () => {
    // An empowered ability is per-owner, so the zoom relies on the caller
    // passing the flag. Without it the glow was lost in the zoom (the bug).
    expect(cardZoomContent("ability.estates", true).empowered).toBe(true);
    // CONTROL: the same ability with no flag is not intrinsically empowered.
    expect(cardZoomContent("ability.estates").empowered).toBe(false);
    // A Statistic stays intrinsic whether or not a flag is passed.
    expect(cardZoomContent("stat.power.empowered", false).empowered).toBe(true);
  });
});

// @vitest-environment jsdom
import { cleanup, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InitiativeRail, InspectPanel } from "./board";
import { CardZoomProvider } from "./zoom";
import { createInitialGameState, makeActiveEffect, type GameState } from "@/engine";

afterEach(cleanup);

const HASTED_UNIT = "unit_p1_marksmen";

/** Give one unit a lasting +N initiative shift, exactly as Haste would. */
function withInitiativeBonus(state: GameState, unitId: string, amount: number): GameState {
  const effect = makeActiveEffect(
    state,
    {
      name: "Haste",
      scope: "unit",
      modifiers: [{ type: "INITIATIVE_BONUS", amount }],
      duration: { type: "combat" }
    },
    { type: "system" },
    "p1",
    { type: "unit", unitId }
  );
  state.activeEffects.push(effect);
  return state;
}

/** The order-stripe badge for the unit whose button title names `cardName`. */
function badgeFor(container: HTMLElement, cardName: string): HTMLElement {
  const button = within(container)
    .getAllByRole("button")
    .find((element) => (element.getAttribute("title") ?? "").includes(cardName));
  if (!button) {
    throw new Error(`No initiative card for ${cardName}`);
  }
  return button.querySelector(".initBadge") as HTMLElement;
}

describe("InitiativeRail — the order stripe tracks Haste/Slow, not just printed initiative", () => {
  it("shows the base initiative with no effects, and the boosted number once Haste is on", () => {
    const state = createInitialGameState("hand-cast-expert");
    const unit = state.combat!.units[HASTED_UNIT];
    const base = unit.initiative;

    const before = render(
      <CardZoomProvider>
        <InitiativeRail state={state} />
      </CardZoomProvider>
    );
    const baseBadge = badgeFor(before.container, unit.cardName);
    expect(baseBadge.textContent).toBe(String(base));
    expect(baseBadge.className).not.toContain("boosted");
    cleanup();

    withInitiativeBonus(state, HASTED_UNIT, 3);
    const after = render(
      <CardZoomProvider>
        <InitiativeRail state={state} />
      </CardZoomProvider>
    );
    const hastedBadge = badgeFor(after.container, unit.cardName);
    // Fails if the badge prints unit.initiative (base) instead of the effective
    // value — i.e. if the Haste-aware display is removed.
    expect(hastedBadge.textContent).toBe(String(base + 3));
    expect(hastedBadge.className).toContain("boosted");
  });

  it("flags a Slow (negative shift) and lowers the number", () => {
    const state = createInitialGameState("hand-cast-expert");
    const unit = state.combat!.units[HASTED_UNIT];
    const base = unit.initiative;

    withInitiativeBonus(state, HASTED_UNIT, -2);
    const { container } = render(
      <CardZoomProvider>
        <InitiativeRail state={state} />
      </CardZoomProvider>
    );
    const badge = badgeFor(container, unit.cardName);
    expect(badge.textContent).toBe(String(base - 2));
    expect(badge.className).toContain("slowed");
  });
});

describe("InitiativeRail — Polish Wait and Defend markers", () => {
  function findCard(container: HTMLElement, cardName: string): HTMLElement {
    const button = within(container)
      .getAllByRole("button")
      .find((element) => (element.getAttribute("title") ?? "").includes(cardName));
    if (!button) {
      throw new Error(`No initiative card for ${cardName}`);
    }
    return button;
  }

  it("marks a Waited unit with an hourglass, un-greys it, and moves it to the TAIL of the rail", () => {
    const state = createInitialGameState("rail-wait-ui");
    const marksmen = state.combat!.units[HASTED_UNIT];
    // Make it the fastest, so without the wait it would LEAD the rail…
    marksmen.initiative = 30;
    // …but it Waited: it acted in the main phase and re-queues at the tail.
    marksmen.activatedThisRound = true;
    marksmen.waitPending = true;
    marksmen.waitToken = 1;

    const { container } = render(
      <CardZoomProvider>
        <InitiativeRail state={state} />
      </CardZoomProvider>
    );
    const card = findCard(container, marksmen.cardName);
    // Wears the wait class + hourglass mark, and is NOT greyed as "done".
    expect(card.className).toContain("waited");
    expect(card.className).not.toContain("done");
    expect(card.querySelector(".initWaitMark")).toBeTruthy();

    // Despite being the fastest, it is the LAST card in the order stripe.
    const initCards = within(container)
      .getAllByRole("button")
      .filter((element) => element.querySelector(".initBadge"));
    expect(initCards[initCards.length - 1]).toBe(card);
  });

  it("marks a Defending unit with a shield", () => {
    const state = createInitialGameState("rail-defend-ui");
    const unit = state.combat!.units[HASTED_UNIT];
    unit.defenseToken = true;
    const { container } = render(
      <CardZoomProvider>
        <InitiativeRail state={state} />
      </CardZoomProvider>
    );
    const card = findCard(container, unit.cardName);
    expect(card.className).toContain("defending");
    expect(card.querySelector(".initDefendMark")).toBeTruthy();

    // CONTROL: an un-defending unit shows no shield.
    cleanup();
    const fresh = createInitialGameState("rail-defend-none");
    const { container: freshContainer } = render(
      <CardZoomProvider>
        <InitiativeRail state={fresh} />
      </CardZoomProvider>
    );
    expect(freshContainer.querySelectorAll(".initDefendMark")).toHaveLength(0);
  });
});

describe("InspectPanel — the unit card definition reflects the effective initiative", () => {
  it("prints the Haste-boosted initiative (with the base noted), not the printed value", () => {
    const state = createInitialGameState("hand-cast-expert");
    const unit = state.combat!.units[HASTED_UNIT];
    const base = unit.initiative;
    withInitiativeBonus(state, HASTED_UNIT, 3);

    const { container } = render(
      <CardZoomProvider>
        <InspectPanel state={state} unitId={HASTED_UNIT} />
      </CardZoomProvider>
    );
    const kind = container.querySelector(".inspectKind") as HTMLElement;
    expect(kind.textContent).toContain(`initiative ${base + 3}`);
    expect(kind.textContent).toContain(`base ${base}`);
  });
});

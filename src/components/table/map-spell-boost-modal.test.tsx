// @vitest-environment jsdom
/**
 * Map spell cast-then-boost window: the battle-style Power tray
 * (MapSpellBoostModal) replaces the old PromptTray text-button list. The tray
 * shows the spell's card face, a live combat-style Power meter, and every
 * engine offer as a card tile — including the Tunic of the Cyclops
 * King's TWO sides (the missing "+2 Power" was the reported bug). Presentation
 * only: each tile dispatches the exact CHOOSE_OPTION the engine offered.
 */
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MapSpellBoostModal } from "./map-spell-boost-modal";
import { CardZoomProvider } from "./zoom";
import { PromptTray } from "@/components/adventure/screen";
import { cardLibrary } from "@/data/cards/library";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  mapSpellPowerTiers,
  type GameAction,
  type GameState
} from "@/engine";

afterEach(cleanup);

function wrap(ui: ReactElement) {
  return render(<CardZoomProvider>{ui}</CardZoomProvider>);
}

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((e) => e.message).join("; ")).toEqual([]);
  return result.state;
}

/** Cast View Air with the given hand so the real map-spell-boost choice opens. */
function openBoost(cards: string[]): GameState {
  let state = createAdventureGameState({ seed: "map-boost-modal-ui", difficulty: "normal", rollFirstPlayer: false });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  state.players.p1.hand = [...cards];
  state = applyOk(state, {
    type: "PLAY_CARD",
    playerId: "p1",
    cardId: "spell.view_air",
    mode: "basic",
    target: { type: "none" }
  });
  expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context).toBe("map-spell-boost");
  return state;
}

describe("MapSpellBoostModal — battle-style Power tray", () => {
  it("uses the combat reaction tray, shows BOTH Tunic sides, and dispatches the exact engine option", () => {
    const state = openBoost(["spell.view_air", "artifact.tunic_of_the_cyclops_king"]);
    const legalActions = getLegalActions(state, "p1");
    const onAction = vi.fn();
    wrap(<MapSpellBoostModal legalActions={legalActions} onAction={onAction} state={state} viewerPlayerId="p1" />);

    expect(screen.getByRole("dialog", { name: /View Air/i })).toBeTruthy();
    const dialog = screen.getByRole("dialog", { name: /View Air/i });
    expect(dialog.className).toContain("reactionTray");
    expect(dialog.querySelector(".modalBackdrop")).toBeNull();
    expect(screen.getByTestId("spell-boost-power").textContent).toContain("Power 0");
    expect(dialog.querySelector(".spellBoostTier"), "there is no tier picker").toBeNull();

    // BOTH Tunic sides are tiles (the +2 used to be missing — the reported bug),
    // each wearing the card's face image.
    const plusTwo = screen.getByRole("button", {
      name: /Discard Tunic of the Cyclops King \(\+2 Power\)/i
    });
    const drawSide = screen.getByRole("button", {
      name: /Discard Tunic of the Cyclops King \(\+1 Power, draw 1\)/i
    });
    expect(plusTwo.closest(".trayTile")?.querySelector("img"), "tiles wear the card face").toBeTruthy();
    expect(drawSide).toBeTruthy();

    // Clicking a tile dispatches the exact index-aligned CHOOSE_OPTION.
    fireEvent.click(plusTwo);
    expect(onAction).toHaveBeenCalledTimes(1);
    const action = onAction.mock.calls[0]![0] as Extract<GameAction, { type: "CHOOSE_OPTION" }>;
    expect(action.type).toBe("CHOOSE_OPTION");
    expect(action.choiceId).toBe(state.pendingChoice!.id);
    const boost = state.pendingChoice?.type === "OPTION_CHOICE" ? state.pendingChoice.mapSpellBoost : null;
    const plusTwoIndex = boost!.offers.findIndex(
      (offer) => offer.kind === "card" && offer.cardId === "artifact.tunic_of_the_cyclops_king" && offer.value === 2
    );
    expect(action.optionIndex).toBe(plusTwoIndex);

    // The trailing "Resolve now" is a primary button dispatching the resolve index.
    const resolve = screen.getByRole("button", { name: /Commit Power & Cast/i });
    fireEvent.click(resolve);
    const resolveAction = onAction.mock.calls[1]![0] as Extract<GameAction, { type: "CHOOSE_OPTION" }>;
    expect(resolveAction.optionIndex).toBe(boost!.offers.length);
  });

  // AUDIT FIX. The rework dropped the printed tier LADDER (it was a picker AND a
  // readout). Without any "what does more Power buy" line the tray only says
  // what the cast does NOW, so deciding whether to burn a card for +1 is blind.
  // The next unreached breakpoint is spelled out beside the live Power instead.
  it("names the NEXT Power breakpoint beside the live meter, and says so when maxed", () => {
    const state = openBoost(["spell.view_air", "artifact.tunic_of_the_cyclops_king"]);
    wrap(
      <MapSpellBoostModal
        legalActions={getLegalActions(state, "p1")}
        onAction={vi.fn()}
        state={state}
        viewerPlayerId="p1"
      />
    );
    const tiers = mapSpellPowerTiers(cardLibrary["spell.view_air"])!;
    const next = tiers.tiers.find((tier) => tier.minPower > 0)!;
    expect(screen.getByTestId("spell-boost-next-tier").textContent).toBe(
      `Next at Power ${next.minPower}: ${next.label}`
    );

    // CONTROL: at the top breakpoint there is no next tier to name.
    cleanup();
    const maxed = openBoost(["spell.view_air", "artifact.tunic_of_the_cyclops_king"]);
    const boost =
      maxed.pendingChoice?.type === "OPTION_CHOICE" ? maxed.pendingChoice.mapSpellBoost : null;
    boost!.power = tiers.maxPower;
    boost!.effectivePower = tiers.maxPower;
    wrap(
      <MapSpellBoostModal
        legalActions={getLegalActions(maxed, "p1")}
        onAction={vi.fn()}
        state={maxed}
        viewerPlayerId="p1"
      />
    );
    expect(screen.getByTestId("spell-boost-next-tier").textContent).toBe("Highest effect reached");
  });

  it("withholds Resolve while a printed cost discard is owed (Titan's Cuirass +4)", () => {
    let state = openBoost(["spell.view_air", "artifact.titans_cuirass", "spell.haste"]);
    const boost = state.pendingChoice?.type === "OPTION_CHOICE" ? state.pendingChoice.mapSpellBoost : null;
    const plusFour = boost!.offers.findIndex(
      (offer) => offer.kind === "card" && offer.cardId === "artifact.titans_cuirass" && offer.value === 4
    );
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: plusFour
    });

    const onAction = vi.fn();
    wrap(
      <MapSpellBoostModal
        legalActions={getLegalActions(state, "p1")}
        onAction={onAction}
        state={state}
        viewerPlayerId="p1"
      />
    );
    expect(screen.queryByRole("button", { name: /Commit Power & Cast/i })).toBeNull();
    expect(screen.getByText(/Pay the printed cost before resolving/i)).toBeTruthy();
    // The cost section names the source and offers the hand card as payment.
    expect(screen.getAllByText(/Pay Titan's Cuirass/i).length).toBeGreaterThan(0);
    const pay = screen.getByRole("button", { name: /Discard Haste — pays Titan's Cuirass/i });
    fireEvent.click(pay);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("another viewer sees only a waiting strip (hidden info stays hidden)", () => {
    const state = openBoost(["spell.view_air", "artifact.tunic_of_the_cyclops_king"]);
    wrap(
      <MapSpellBoostModal
        legalActions={getLegalActions(state, "p2")}
        onAction={vi.fn()}
        state={state}
        viewerPlayerId="p2"
      />
    );
    expect(screen.getByRole("status").textContent).toContain("adding Power");
    expect(screen.queryByText(/Tunic/i)).toBeNull();
  });

  it("CONTROL: the PromptTray no longer renders the map-spell-boost box list (owner AND bystander)", () => {
    const state = openBoost(["spell.view_air", "artifact.tunic_of_the_cyclops_king"]);
    const owner = wrap(
      <PromptTray
        legalActions={getLegalActions(state, "p1")}
        onAction={vi.fn()}
        state={state}
        viewerPlayerId="p1"
      />
    );
    expect(owner.container.textContent).toBe("");
    cleanup();
    const bystander = wrap(
      <PromptTray
        legalActions={getLegalActions(state, "p2")}
        onAction={vi.fn()}
        state={state}
        viewerPlayerId="p2"
      />
    );
    expect(bystander.container.textContent).toBe("");
  });
});

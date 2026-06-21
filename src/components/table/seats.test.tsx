// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HandFan } from "./seats";
import { CardZoomProvider } from "./zoom";
import { createInitialGameState, getLegalActions, getPlayerView, type GameState } from "@/engine";

afterEach(cleanup);

/** Combat state where p1 can cast Magic Arrow with Earth Magic in play. */
function castState(): GameState {
  const state = createInitialGameState("hand-cast-expert");
  state.players.p1.hand = ["spell.magic_arrow"];
  state.players.p1.permanents = ["ability.earth_magic"];
  state.players.p2.hand = [];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_marksmen";
  return state;
}

describe("HandFan — Schools of Magic offer the expert as a cast-time choice", () => {
  it("shows a plain cast and a '+ School of Magic (+3)' cast, the latter carrying useSchoolExpert", () => {
    const state = castState();
    const onSelectCardAction = vi.fn();
    render(
      <CardZoomProvider>
        <HandFan
          view={getPlayerView(state, "p1")}
          state={state}
          viewerPlayerId="p1"
          legalActions={getLegalActions(state, "p1")}
          selectedCardAction={null}
          trayActive={false}
          onSelectCardAction={onSelectCardAction}
          onAction={() => {}}
        />
      </CardZoomProvider>
    );

    // Open the Magic Arrow card's action popover.
    fireEvent.click(screen.getByRole("button", { name: /Magic Arrow card/i }));

    // The plain cast targeting is offered…
    const picks = screen.getAllByRole("button", { name: /^Pick target/i });
    expect(picks.length).toBeGreaterThanOrEqual(2);
    // …and so is the cast-time School-of-Magic expert.
    const expertPick = screen.getByRole("button", { name: /Pick target \+ School of Magic \(\+3\)/i });
    fireEvent.click(expertPick);

    expect(onSelectCardAction).toHaveBeenCalledTimes(1);
    expect(onSelectCardAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "CAST_SPELL",
        cardId: "spell.magic_arrow",
        useSchoolExpert: true
      })
    );
  });
});

describe("HandFan — Spell Book window (house rule)", () => {
  it("the Spell Book icon opens a list of stored Spells and casting one routes to target picking", () => {
    const state = createInitialGameState("book-window-ui");
    state.players.p1.hand = [];
    state.players.p1.spellBook = ["spell.magic_arrow"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";

    const onAction = vi.fn();
    render(
      <CardZoomProvider>
        <HandFan
          view={getPlayerView(state, "p1")}
          state={state}
          viewerPlayerId="p1"
          legalActions={getLegalActions(state, "p1")}
          selectedCardAction={null}
          trayActive={false}
          onSelectCardAction={() => {}}
          onAction={onAction}
        />
      </CardZoomProvider>
    );

    // The window is closed until the Spell Book icon is clicked.
    expect(screen.queryByRole("menu", { name: /Spell Book spells/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Spell Book/i }));

    // The stored Spell is listed, with a concrete (pre-targeted) cast button.
    const menu = screen.getByRole("menu", { name: /Spell Book spells/i });
    expect(menu).toBeTruthy();
    const castButtons = screen.getAllByRole("button", { name: /^Cast →/i });
    expect(castButtons.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(castButtons[0]!);

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "CAST_SPELL", cardId: "spell.magic_arrow", fromSpellBook: true })
    );
  });
});

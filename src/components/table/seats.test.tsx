// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HandFan, PermanentSlot, RuneTrack } from "./seats";
import { CardZoomProvider } from "./zoom";
import { cardLibrary } from "@/data/cards/library";
import {
  createInitialGameState,
  describePermanentEffect,
  getLegalActions,
  getPlayerView,
  type GameState
} from "@/engine";

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

describe("RuneTrack — Bulwark combat HUD", () => {
  function bulwarkCombat(buildings: string[], count: number): GameState {
    const state = createInitialGameState("rune-track-ui");
    state.players.p1.factionId = "bulwark";
    state.towns.town_p1.factionId = "bulwark";
    state.towns.town_p1.buildings.push(...buildings);
    state.combat!.runes = { p1: { count, appliedLevel: 0 } };
    return state;
  }

  it("shows the count, level and each level's bonus with active/pending/locked status", () => {
    // Sieidi built (cap 2), 7 Runes earned = Level 2: L1+L2 active, L3 locked.
    const state = bulwarkCombat(["bulwark.sieidi"], 7);
    const { container } = render(<RuneTrack state={state} playerId="p1" />);

    expect(screen.getByLabelText(/Runes for .*: 7 of 10, Level 2 of 2/i)).toBeTruthy();
    expect(screen.getByText("+1 Attack")).toBeTruthy();
    expect(screen.getByText("+1 Defense")).toBeTruthy();
    expect(screen.getByText("+3 Initiative")).toBeTruthy();

    expect(container.querySelectorAll(".runeLevel.active")).toHaveLength(2);
    expect(container.querySelectorAll(".runeLevel.pending")).toHaveLength(0);
    expect(container.querySelectorAll(".runeLevel.locked")).toHaveLength(1);
  });

  it("marks the unlocked-but-unearned level as pending (Sieidi built, only base Runes)", () => {
    // Sieidi built (cap 2) but only 4 Runes (Level 1): L2 is PENDING, not active.
    const state = bulwarkCombat(["bulwark.sieidi"], 4);
    const { container } = render(<RuneTrack state={state} playerId="p1" />);
    expect(container.querySelectorAll(".runeLevel.active")).toHaveLength(1);
    expect(container.querySelectorAll(".runeLevel.pending")).toHaveLength(1);
    expect(container.querySelectorAll(".runeLevel.locked")).toHaveLength(1);
  });

  it("renders the compact pip form with three status dots", () => {
    const state = bulwarkCombat(["bulwark.sieidi", "bulwark.altar"], 10);
    const { container } = render(<RuneTrack state={state} playerId="p1" compact />);
    expect(container.querySelectorAll(".runePip")).toHaveLength(3);
    expect(container.querySelectorAll(".runePip.active")).toHaveLength(3);
    expect(container.querySelector(".runeLevels")).toBeNull(); // no labelled chips in compact mode
  });

  it("renders nothing for a non-Bulwark player", () => {
    const state = createInitialGameState("rune-track-none");
    state.players.p1.factionId = "castle";
    const { container } = render(<RuneTrack state={state} playerId="p1" />);
    expect(container.firstChild).toBeNull();
  });
});

describe("PermanentSlot — the permanent effect is shown clearly (map card tray)", () => {
  it("renders the permanent's name AND its full effect text (not just the card image)", () => {
    const state = createInitialGameState("permanent-effect-shown");
    // A permanent income artifact in play (Eversmoking Ring of Sulfur).
    state.players.p1.permanents = ["artifact.eversmoking_ring_of_sulfur"];
    const card = cardLibrary["artifact.eversmoking_ring_of_sulfur"]!;
    const effectText = describePermanentEffect(card);

    const { container } = render(
      <CardZoomProvider>
        <PermanentSlot
          state={state}
          playerId="p1"
          viewerPlayerId="p1"
          legalActions={getLegalActions(state, "p1")}
          onAction={() => {}}
        />
      </CardZoomProvider>
    );

    // The name is shown…
    expect(screen.getByText(card.name)).toBeTruthy();
    // …and so is the spelled-out effect (this is the "shown clearly" guarantee:
    // remove the <small>{describePermanentEffect}</small> line and this fails).
    expect(effectText.length).toBeGreaterThan(0);
    expect(container.textContent).toContain(effectText);
  });

  it("renders nothing when the player has no permanent in play", () => {
    const state = createInitialGameState("permanent-effect-none");
    state.players.p1.permanents = [];
    state.players.p1.permanent = undefined;
    const { container } = render(
      <CardZoomProvider>
        <PermanentSlot state={state} playerId="p1" viewerPlayerId="p1" />
      </CardZoomProvider>
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("HandFan — Spell Book window (house rule)", () => {
  it("the Spell Book icon opens a list of stored Spells and casting one routes to target picking", () => {
    const state = createInitialGameState("book-window-ui");
    state.players.p1.hand = [];
    // Lightning Bolt (not the starting-only Magic Arrow) is a Spell that can
    // actually live in the Book; it casts at an enemy unit like a hand Spell.
    state.players.p1.spellBook = ["spell.lightning_bolt"];
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
      expect.objectContaining({ type: "CAST_SPELL", cardId: "spell.lightning_bolt", fromSpellBook: true })
    );
  });

  it("shows the Spell Book icon from the start even when empty, and says so when opened", () => {
    const state = createInitialGameState("book-window-empty");
    state.players.p1.hand = [];
    state.players.p1.spellBook = [];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";

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
          onAction={() => {}}
        />
      </CardZoomProvider>
    );

    // The icon is present despite the empty Book…
    const icon = screen.getByRole("button", { name: /Spell Book/i });
    expect(icon).toBeTruthy();
    fireEvent.click(icon);
    // …and opening it shows the empty-state message.
    const menu = screen.getByRole("menu", { name: /Spell Book spells/i });
    expect(menu.textContent).toMatch(/No Spells here/i);
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HandFan, OpponentBar, PermanentSlot, RuneTrack, SeatNameplate } from "./seats";
import { CardZoomProvider } from "./zoom";
import * as sound from "@/lib/sound";
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

describe("HandFan — a single-target Spell arms targeting on click (clear click-to-target, no text popover)", () => {
  function lightningState(): GameState {
    const state = createInitialGameState("hand-single-target");
    state.players.p1.hand = ["spell.lightning_bolt"]; // one target mode, no School permanent
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    return state;
  }

  it("clicking Lightning Bolt selects its cast straight away instead of opening a text popover", () => {
    const state = lightningState();
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

    // One click arms board targeting — the player then clicks the enemy hex.
    fireEvent.click(screen.getByRole("button", { name: /Lightning Bolt card/i }));
    expect(onSelectCardAction).toHaveBeenCalledTimes(1);
    expect(onSelectCardAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "CAST_SPELL", cardId: "spell.lightning_bolt" })
    );
    // The "convoluted" popover (effect text, Read card, Pick target, Close) is
    // bypassed: no menu, no "Pick target" text button.
    expect(screen.queryByRole("menu", { name: /Lightning Bolt actions/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Pick target/i })).toBeNull();
  });

  it("CONTROL: a multi-mode Spell (Magic Arrow + School of Magic) still opens the popover to choose", () => {
    const state = castState(); // Magic Arrow + Earth Magic ⇒ plain + '+ School' casts
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
    // Two target modes ⇒ a choice exists ⇒ clicking opens the popover (no direct arm).
    fireEvent.click(screen.getByRole("button", { name: /Magic Arrow card/i }));
    expect(onSelectCardAction).not.toHaveBeenCalled();
    expect(screen.getAllByRole("button", { name: /^Pick target/i }).length).toBeGreaterThanOrEqual(2);
  });
});

describe("HandFan — freshly-drawn cards are HIDDEN, never removed (the disappearing-hand guard)", () => {
  // The bug: a freshly-drawn hand could end a turn looking EMPTY (0 cards, no
  // game event) because the whole hand was held `visibility:hidden` ("incoming")
  // waiting for a draw flight whose reveal never fired. This pins the underlying
  // contract the page-level backstop relies on: the hidden tail is a pure CSS
  // hide — every card stays mounted in the DOM — so clearing the hidden count
  // ALWAYS brings real cards back; a stuck hide can only ever blank the display,
  // it can never lose a card.
  function threeCardHandState(): GameState {
    const state = createInitialGameState("hand-hidden-tail");
    state.players.p1.hand = ["spell.magic_arrow", "spell.magic_arrow", "spell.magic_arrow"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    return state;
  }

  function renderHand(hiddenTailCount: number) {
    const state = threeCardHandState();
    return render(
      <CardZoomProvider>
        <HandFan
          view={getPlayerView(state, "p1")}
          state={state}
          viewerPlayerId="p1"
          legalActions={getLegalActions(state, "p1")}
          selectedCardAction={null}
          trayActive={false}
          hiddenTailCount={hiddenTailCount}
          onSelectCardAction={() => {}}
          onAction={() => {}}
        />
      </CardZoomProvider>
    );
  }

  it("hides the WHOLE hand visually when the hidden tail covers it, yet renders every card", () => {
    const { container } = renderHand(3); // the worst case: the entire fresh hand
    const slots = container.querySelectorAll(".fanSlot");
    expect(slots).toHaveLength(3); // all three cards are STILL mounted — none lost
    // …and all three are merely hidden (the CSS `incoming` blanket), so the moment
    // the count is cleared they re-appear. A removed card could never come back.
    expect(container.querySelectorAll(".fanSlot.incoming")).toHaveLength(3);
  });

  it("hides ONLY the freshly drawn tail, leaving older cards visible", () => {
    const { container } = renderHand(1); // one card just drew; the other two are old
    expect(container.querySelectorAll(".fanSlot")).toHaveLength(3);
    expect(container.querySelectorAll(".fanSlot.incoming")).toHaveLength(1);
  });

  it("CONTROL: with no hidden tail, nothing is hidden", () => {
    const { container } = renderHand(0);
    expect(container.querySelectorAll(".fanSlot")).toHaveLength(3);
    expect(container.querySelectorAll(".fanSlot.incoming")).toHaveLength(0);
  });
});

describe("HandFan — pending-action echo marks a submitted card in flight (plan N2)", () => {
  function twoCardHandState(): GameState {
    const state = createInitialGameState("hand-in-flight");
    state.players.p1.hand = ["spell.magic_arrow", "spell.haste"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    return state;
  }

  function renderHand(inFlightCardIds?: ReadonlySet<string>) {
    const state = twoCardHandState();
    return render(
      <CardZoomProvider>
        <HandFan
          view={getPlayerView(state, "p1")}
          state={state}
          viewerPlayerId="p1"
          legalActions={getLegalActions(state, "p1")}
          selectedCardAction={null}
          trayActive={false}
          inFlightCardIds={inFlightCardIds}
          onSelectCardAction={() => {}}
          onAction={() => {}}
        />
      </CardZoomProvider>
    );
  }

  it("dims exactly the in-flight card, and dropping the entry restores it (rollback = remove a CSS state)", () => {
    const { container, rerender } = renderHand(new Set(["spell.haste"]));
    const inFlight = container.querySelectorAll(".fanCard.cardInFlight");
    expect(inFlight).toHaveLength(1);
    expect(inFlight[0].getAttribute("title")).toContain("Haste");
    // Both cards stay MOUNTED — the echo never removes a card from the DOM.
    expect(container.querySelectorAll(".fanCard")).toHaveLength(2);

    // The submit settled with an error: the echo entry is dropped and the same
    // render shows the card fully restored.
    const state = twoCardHandState();
    rerender(
      <CardZoomProvider>
        <HandFan
          view={getPlayerView(state, "p1")}
          state={state}
          viewerPlayerId="p1"
          legalActions={getLegalActions(state, "p1")}
          selectedCardAction={null}
          trayActive={false}
          inFlightCardIds={new Set()}
          onSelectCardAction={() => {}}
          onAction={() => {}}
        />
      </CardZoomProvider>
    );
    expect(container.querySelectorAll(".fanCard.cardInFlight")).toHaveLength(0);
    expect(container.querySelectorAll(".fanCard")).toHaveLength(2);
  });

  it("CONTROL: with the echo not wired (no prop), hand rendering is unchanged", () => {
    const { container } = renderHand(undefined);
    expect(container.querySelectorAll(".fanCard")).toHaveLength(2);
    expect(container.querySelectorAll(".fanCard.cardInFlight")).toHaveLength(0);
  });
});

describe("HandFan — an instant artifact's 'take a card from discard' is usable in COMBAT", () => {
  // The reported bug: clicking Skull Helmet (or the Helm of the Alabaster
  // Unicorn) in battle offered no usable option. Its "take a card from your
  // discard" side is a click-to-use combat play now, so the button must render
  // in the hand popover and dispatch the play.
  function skullCombat(): GameState {
    const state = createInitialGameState("skull-helmet-combat-ui");
    state.players.p1.hand = ["artifact.skull_helmet"];
    state.players.p1.discard = ["stat.attack"]; // a non-artifact card to recover
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    return state;
  }

  it("shows the 'Take 1 non-Artifact card…' button in combat and dispatches it on confirm", () => {
    const state = skullCombat();
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

    // Open the Skull Helmet card; its discard-pick option is offered IN COMBAT.
    fireEvent.click(screen.getByRole("button", { name: /Skull Helmet artifact card/i }));
    const takeButton = screen.getByRole("button", { name: /Take 1 non-Artifact card/i });
    expect(takeButton).toBeTruthy();

    // Clicking arms a Confirm (no accidental commit); Confirm dispatches option 0.
    fireEvent.click(takeButton);
    fireEvent.click(screen.getByRole("button", { name: /^Confirm$/i }));
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "PLAY_CARD", cardId: "artifact.skull_helmet", optionIndex: 0 })
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
  it("the Spell Book icon opens the full grimoire and casting a stored Spell dispatches it", () => {
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

    // The grimoire is closed until the Spell Book icon is clicked. In combat
    // it opens the SAME full two-page book the map uses (a dialog portal),
    // not the old list popover.
    expect(screen.queryByRole("dialog", { name: /Spell Book/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Spell Book/i }));

    // The stored Spell is on the index page, with a concrete (pre-targeted)
    // cast button on the plate.
    const book = screen.getByRole("dialog", { name: /Spell Book/i });
    expect(book.textContent).toContain("Lightning Bolt");
    const castButtons = screen.getAllByRole("button", { name: /^Cast →/i });
    expect(castButtons.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(castButtons[0]!);

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "CAST_SPELL", cardId: "spell.lightning_bolt", fromSpellBook: true })
    );
  });

  it("shows the selected Spell's card art on the grimoire plate (art, not just the name)", () => {
    const state = createInitialGameState("book-window-icon");
    state.players.p1.hand = [];
    state.players.p1.spellBook = ["spell.lightning_bolt"];
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

    fireEvent.click(screen.getByRole("button", { name: /Spell Book/i }));

    // The grimoire portals to document.body; its right page renders the
    // selected Spell's illustrated plate — remove the <img> and this fails.
    const img = document.querySelector(".spellBookArt") as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img!.tagName).toBe("IMG");
    expect(img!.getAttribute("src")).toBeTruthy();
  });

  it("plays the Spell Book open cue when opened — and NOT when closed", () => {
    const spy = vi.spyOn(sound, "playSpellBookOpen").mockImplementation(() => {});
    const state = createInitialGameState("book-window-sound");
    state.players.p1.hand = [];
    state.players.p1.spellBook = ["spell.lightning_bolt"];
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

    const icon = screen.getByRole("button", { name: /Spell Book/i });
    // Opening the Book fires the page-flip cue exactly once…
    fireEvent.click(icon);
    expect(spy).toHaveBeenCalledTimes(1);
    // …and closing it again is silent (no second cue).
    fireEvent.click(icon);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
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
    // …and opening it shows the grimoire's blank-pages message.
    const book = screen.getByRole("dialog", { name: /Spell Book/i });
    expect(book.textContent).toMatch(/pages are blank/i);
  });
});

describe("HandFan — every immediate card play is cancellable (no accidental commit)", () => {
  /** Combat where p1 holds the Breastplate, whose "Draw 1 card" is a no-target play. */
  function breastplateState(): GameState {
    const state = createInitialGameState("hand-confirm-cancel");
    state.players.p1.hand = ["artifact.breastplate_of_petrified_wood"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    return state;
  }

  function renderHand(state: GameState, onAction: (action: unknown) => void) {
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
  }

  it("clicking an immediate play does NOT send it — it arms a Confirm/Cancel step first", () => {
    const onAction = vi.fn();
    renderHand(breastplateState(), onAction);

    // Open the card and click its immediate "Draw 1 card" play.
    fireEvent.click(screen.getByRole("button", { name: /Breastplate of Petrified Wood artifact card/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Draw 1 card$/i }));

    // Nothing has been sent to the engine yet (the accident is recoverable).
    expect(onAction).not.toHaveBeenCalled();
    // A Confirm and a Cancel are now offered.
    expect(screen.getByRole("button", { name: /^Confirm$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Cancel$/i })).toBeTruthy();
  });

  it("Cancel backs out with NO action sent; Confirm is the only thing that plays it", () => {
    const onAction = vi.fn();
    renderHand(breastplateState(), onAction);

    fireEvent.click(screen.getByRole("button", { name: /Breastplate of Petrified Wood artifact card/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Draw 1 card$/i }));
    // Cancel: still nothing sent.
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));
    expect(onAction).not.toHaveBeenCalled();

    // Re-arm and Confirm: now (and only now) the play is dispatched, exactly once.
    fireEvent.click(screen.getByRole("button", { name: /^Draw 1 card$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Confirm$/i }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "PLAY_CARD",
        cardId: "artifact.breastplate_of_petrified_wood",
        optionIndex: 0
      })
    );
  });
});

describe("SeatNameplate / OpponentBar — person + hero + town", () => {
  function seatRoom(state: GameState): GameState {
    state.room = {
      hosted: true,
      hostClientId: "cA",
      members: [
        { clientId: "cA", name: "Binh", seat: "p1", isHost: true, userId: "u1" },
        { clientId: "cB", name: "Alex", seat: "p2", isHost: false }
      ]
    };
    return state;
  }

  it("shows the seated opponent's person name with their hero · town", () => {
    const state = seatRoom(createInitialGameState("seat-nameplate"));
    render(
      <CardZoomProvider>
        <OpponentBar view={getPlayerView(state, "p1")} state={state} viewerPlayerId="p1" />
      </CardZoomProvider>
    );
    // Viewer p1 (Binh) sees opponent p2 = Alex playing Sandro of Necropolis.
    expect(screen.getByText("Alex")).toBeTruthy();
    expect(screen.getByText("Sandro · Necropolis")).toBeTruthy();
  });

  it("marks the host with a crown and the person, not the seat label", () => {
    const state = seatRoom(createInitialGameState("seat-nameplate"));
    render(<SeatNameplate state={state} playerId="p1" />);
    expect(screen.getByText("Binh")).toBeTruthy();
    // The redundant hero·town line only appears alongside a person name.
    expect(screen.getByText("Catherine · Castle")).toBeTruthy();
  });

  it("on an open/solo table (no room) falls back to the seat label, no duplicate pick line", () => {
    const state = createInitialGameState("seat-nameplate");
    expect(state.room).toBeUndefined();
    render(<SeatNameplate state={state} playerId="p2" />);
    // The seat label already encodes hero + town, so it is the whole nameplate.
    expect(screen.getByText("Sandro (Necropolis)")).toBeTruthy();
    expect(screen.queryByText("Sandro · Necropolis")).toBeNull();
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HandFan, OpponentBar, PermanentSlot, RuneTrack, SeatNameplate } from "./seats";
import { CardZoomProvider } from "./zoom";
import { PolishBalanceArtProvider } from "./polish-balance-art";
import * as sound from "@/lib/sound";
import { cardLibrary } from "@/data/cards/library";
import {
  CAST_A_SPELL_CARD_ID,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  getPlayerView,
  type GameState,
  type LegalAction
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

describe("HandFan — Basic X Magic (fetch permanent) offers its +3 as a cast-time choice", () => {
  /** Combat where p1 can cast Magic Arrow with Basic Earth Magic (fetch) in play. */
  function fetchCastState(): GameState {
    const state = createInitialGameState("hand-cast-fetch-expert");
    state.players.p1.hand = ["spell.magic_arrow"];
    state.players.p1.permanents = ["ability.basic_earth_magic"];
    state.players.p1.limits.expertUses = 1;
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    return state;
  }

  it("shows a plain cast and a '+ Basic Magic (+3)' cast, the latter carrying useSchoolFetchExpert", () => {
    const state = fetchCastState();
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

    fireEvent.click(screen.getByRole("button", { name: /Magic Arrow card/i }));

    // The plain cast targeting AND the cast-time Basic Magic +3 are both offered.
    const picks = screen.getAllByRole("button", { name: /^Pick target/i });
    expect(picks.length).toBeGreaterThanOrEqual(2);
    const fetchPick = screen.getByRole("button", { name: /Pick target \+ Basic Magic \(\+3\)/i });
    fireEvent.click(fetchPick);

    expect(onSelectCardAction).toHaveBeenCalledTimes(1);
    expect(onSelectCardAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "CAST_SPELL",
        cardId: "spell.magic_arrow",
        useSchoolFetchExpert: true
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

  it("card art decodes off the main thread (N5 audit — attributes are inert in jsdom, assert presence)", () => {
    const { container } = renderHand(undefined);
    const art = container.querySelector("img.fanCardImage");
    expect(art?.getAttribute("decoding")).toBe("async");
    // Hand cards are on-screen the moment they mount — eager on purpose.
    expect(art?.getAttribute("loading")).toBe("eager");
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

describe("HandFan — Ciele IV surfaces its free discard-cast on the specialty card", () => {
  // Reported bug: with a Magic Arrow in the discard pile, clicking Ciele's Magic
  // Arrow IV showed NO option. The cast's `cardId` is spell.magic_arrow (sourced
  // from the discard, not the hand) with `fromSpellDeck: specialty.ciele.4`, so it
  // was orphaned — it matched no hand entry and rendered no button.
  function cieleCombat(discard: string[]): GameState {
    const state = createInitialGameState("ciele-iv-hand-ui");
    state.players.p1.hand = ["specialty.ciele.4"];
    state.players.p1.discard = discard;
    state.players.p2.hand = [];
    const griffins = state.combat!.units.unit_p1_griffins;
    griffins.activatedThisRound = false;
    griffins.movedThisActivation = false;
    griffins.attackedThisActivation = false;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    return state;
  }

  it("arms the free Magic Arrow cast when the specialty card is clicked", () => {
    const state = cieleCombat(["spell.magic_arrow"]);
    // Sanity: the engine offers the free, limit-free discard cast.
    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.magic_arrow" &&
        legal.action.fromSpellDeck === "specialty.ciele.4" &&
        (legal.action as { fromOwnDiscard?: boolean }).fromOwnDiscard === true
    );
    expect(cast, "engine should offer the Ciele IV discard cast").toBeTruthy();

    const onSelectCardAction = vi.fn();
    const { container } = render(
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

    const cardButton = container.querySelector(".fanCard");
    expect(cardButton, "the Ciele IV card renders in hand").toBeTruthy();
    // It must be playable (not greyed) — the fix attaches the cast to this entry.
    expect(cardButton?.classList.contains("playable")).toBe(true);
    // A single board-target selection arms targeting straight from the card click.
    fireEvent.click(cardButton!);
    expect(onSelectCardAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "CAST_SPELL",
        cardId: "spell.magic_arrow",
        fromSpellDeck: "specialty.ciele.4",
        fromOwnDiscard: true
      })
    );
  });

  it("CONTROL: with no Magic Arrow in the discard the specialty is not playable", () => {
    const state = cieleCombat([]);
    const { container } = render(
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
    const cardButton = container.querySelector(".fanCard");
    expect(cardButton?.classList.contains("playable")).toBe(false);
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

describe("PermanentSlot — compact card-only tray", () => {
  it("shows only card art until a permanent is clicked, then offers view/discard actions", () => {
    const state = createInitialGameState("permanent-effect-shown");
    state.players.p1.permanents = ["artifact.eversmoking_ring_of_sulfur"];
    const card = cardLibrary["artifact.eversmoking_ring_of_sulfur"]!;
    const onAction = vi.fn();
    const legalActions: LegalAction[] = [
      {
        label: `Discard ${card.name} from play`,
        action: {
          type: "DISCARD_PERMANENT",
          playerId: "p1",
          cardId: card.id
        }
      }
    ];

    const { container } = render(
      <CardZoomProvider>
        <PermanentSlot
          state={state}
          playerId="p1"
          viewerPlayerId="p1"
          legalActions={legalActions}
          onAction={onAction}
        />
      </CardZoomProvider>
    );

    expect(container.querySelectorAll(".permanentSlot.cardOnly")).toHaveLength(1);
    expect(container.textContent).not.toContain(card.name);

    fireEvent.click(screen.getByRole("button", { name: `${card.name} actions` }));
    expect(screen.getByRole("menuitem", { name: /View card/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: /Discard from play/i }));
    expect(onAction).toHaveBeenCalledWith(legalActions[0].action);
  });

  it("keeps ongoing-card text hidden and opens the readable card view on click", () => {
    const state = createInitialGameState("ongoing-card-compact");
    state.players.p1.permanents = [];
    state.players.p1.permanent = undefined;
    state.players.p1.ongoingCards = [
      { cardId: "ability.luck", effectIds: ["luck_effect"], returnTo: "discard" }
    ];
    const onAction = vi.fn();
    const legalActions: LegalAction[] = [
      {
        label: "Discard Luck from play",
        action: {
          type: "DISCARD_ONGOING_CARD",
          playerId: "p1",
          cardId: "ability.luck"
        }
      }
    ];

    const { container } = render(
      <CardZoomProvider>
        <PermanentSlot
          state={state}
          playerId="p1"
          viewerPlayerId="p1"
          legalActions={legalActions}
          onAction={onAction}
        />
      </CardZoomProvider>
    );

    expect(container.textContent).not.toContain("Luck");
    fireEvent.click(screen.getByRole("button", { name: "Luck actions" }));
    expect(screen.getByRole("menuitem", { name: /Discard from play/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: /View card/i }));
    expect(screen.getByRole("dialog", { name: /Luck enlarged/i })).toBeTruthy();
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

  it("shows Spell Scrolls in the permanent tray (not only on the hand shelf)", () => {
    const state = createInitialGameState("permanent-scroll-tray");
    state.players.p1.permanents = [];
    state.players.p1.permanent = undefined;
    state.players.p1.scrolls = [
      { id: "scroll_1", spellCardIds: ["spell.magic_arrow", "spell.curse"] },
    ];

    const { container } = render(
      <CardZoomProvider>
        <PermanentSlot state={state} playerId="p1" viewerPlayerId="p1" />
      </CardZoomProvider>
    );

    expect(container.firstChild).not.toBeNull();
    expect(container.textContent).toMatch(/spell scroll/i);
    expect(container.textContent).toContain("Spell Scroll");
    // Both held spells are named so the tray is the map-side home for scrolls.
    expect(container.textContent).toMatch(/Magic Arrow/i);
    expect(container.textContent).toMatch(/Curse/i);
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

describe("HandFan — Polish Cast a Spell offers Open Spell Book / List the spells", () => {
  /** A combat state with the Polish Spell Book rule on, a Cast a Spell card in
   *  hand and a Lightning Bolt refreshed in the Book. */
  function polishCastState(): GameState {
    const state = createInitialGameState("polish-cast-a-spell-ui");
    const adventure = createAdventureGameState({
      seed: "polish-cast-a-spell-ui-rules",
      ruleset: "binh",
      rollFirstPlayer: false,
      houseRules: { "polish-spell-book": true }
    });
    state.adventure = adventure.adventure;
    state.ruleset = "binh";
    state.players.p1.hand = [CAST_A_SPELL_CARD_ID];
    state.players.p1.spellBook = ["spell.lightning_bolt"];
    state.players.p1.spellBookUsed = [];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    return state;
  }

  function renderHand(state: GameState, handlers: { onSelectCardAction?: (a: unknown) => void; onAction?: (a: unknown) => void }) {
    render(
      <CardZoomProvider>
        <HandFan
          view={getPlayerView(state, "p1")}
          state={state}
          viewerPlayerId="p1"
          legalActions={getLegalActions(state, "p1")}
          selectedCardAction={null}
          trayActive={false}
          onSelectCardAction={handlers.onSelectCardAction ?? (() => {})}
          onAction={handlers.onAction ?? (() => {})}
        />
      </CardZoomProvider>
    );
  }

  it("clicking Cast a Spell opens a menu with both options", () => {
    renderHand(polishCastState(), {});
    fireEvent.click(screen.getByRole("button", { name: /Cast a Spell card/i }));
    expect(screen.getByRole("button", { name: /Open Spell Book/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /List the spells/i })).toBeTruthy();
  });

  it("'Open Spell Book' opens the full grimoire with the refreshed Spell's cast button", () => {
    renderHand(polishCastState(), {});
    fireEvent.click(screen.getByRole("button", { name: /Cast a Spell card/i }));
    expect(screen.queryByRole("dialog", { name: /Spell Book/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Open Spell Book/i }));
    const book = screen.getByRole("dialog", { name: /Spell Book/i });
    expect(book.textContent).toContain("Lightning Bolt");
    expect(screen.getAllByRole("button", { name: /^Cast →/i }).length).toBeGreaterThanOrEqual(1);
  });

  it("'List the spells' lists the castable Book Spell and starts the normal cast (arms targeting)", () => {
    const onSelectCardAction = vi.fn();
    renderHand(polishCastState(), { onSelectCardAction });
    fireEvent.click(screen.getByRole("button", { name: /Cast a Spell card/i }));
    fireEvent.click(screen.getByRole("button", { name: /List the spells/i }));

    // The refreshed Lightning Bolt appears as a compact shortcut…
    const castShortcut = screen.getByRole("button", { name: /Cast Lightning Bolt/i });
    fireEvent.click(castShortcut);

    // …and picking it arms the NORMAL board-targeting cast (fromSpellBook + enabler).
    expect(onSelectCardAction).toHaveBeenCalledTimes(1);
    expect(onSelectCardAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "CAST_SPELL",
        cardId: "spell.lightning_bolt",
        fromSpellBook: true,
        castEnablerCardId: CAST_A_SPELL_CARD_ID
      })
    );
  });

  it("marks Cast a Spell playable (glow) when a Book Spell is castable on this activation", () => {
    renderHand(polishCastState(), {});
    const card = screen.getByRole("button", { name: /Cast a Spell card/i });
    expect(card.className, "Cast a Spell must glow while a Book cast is legal").toMatch(/playable/);
  });

  it("CONTROL: Cast a Spell is not playable while the enemy unit is active (no combat-timing cast)", () => {
    const state = polishCastState();
    state.combat!.activeUnitId = "unit_p2_skeletons";
    renderHand(state, {});
    const card = screen.getByRole("button", { name: /Cast a Spell card/i });
    expect(card.className, "no glow off your activation for combat-timing Book spells").not.toMatch(
      /\bplayable\b/
    );
  });
});

describe("HandFan — Balance Pack Intelligence: play Basic/Expert, then pick the ONE free cast", () => {
  /** A polish-spell-book + polish-card-balance combat at the START window. */
  function balanceIntelligenceState(options: { played?: boolean } = {}): GameState {
    const state = createInitialGameState("balance-intelligence-ui");
    const adventure = createAdventureGameState({
      seed: "balance-intelligence-ui-rules",
      ruleset: "binh",
      rollFirstPlayer: false,
      houseRules: { "polish-spell-book": true, "polish-card-balance": true }
    });
    state.adventure = adventure.adventure;
    state.ruleset = "binh";
    state.players.p1.spellBook = ["spell.lightning_bolt"];
    state.players.p1.spellBookUsed = [];
    state.players.p1.limits.expertUses = 1;
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    if (options.played) {
      // Intelligence already PLAYED (expert): its one-shot freedom is live and
      // the card is spent to the discard (never the Ongoing tray).
      state.players.p1.hand = [CAST_A_SPELL_CARD_ID];
      state.players.p1.discard = ["ability.intelligence"];
      state.activeEffects.push({
        id: "effect_intelligence_ui",
        name: "Expert Intelligence",
        scope: "player",
        controllerId: "p1",
        duration: { type: "combat" },
        polarity: "positive",
        removable: false,
        keepSourceInDiscard: true,
        modifiers: [{ type: "SPELL_CAST_ANYTIME", ignoreSpellLimit: true, oneShot: true }],
        source: { type: "card", cardId: "ability.intelligence", controllerId: "p1" },
        startedRound: state.round,
        usedRollEventIds: [],
        usedChoiceIds: [],
        usedCombatRoundNumbers: []
      });
    } else {
      state.players.p1.hand = ["ability.intelligence"];
    }
    return state;
  }

  function renderHand(
    state: GameState,
    handlers: { onSelectCardAction?: (a: unknown) => void; onAction?: (a: unknown) => void }
  ) {
    render(
      <PolishBalanceArtProvider enabled>
        <CardZoomProvider>
          <HandFan
            view={getPlayerView(state, "p1")}
            state={state}
            viewerPlayerId="p1"
            legalActions={getLegalActions(state, "p1")}
            selectedCardAction={null}
            trayActive={false}
            onSelectCardAction={handlers.onSelectCardAction ?? (() => {})}
            onAction={handlers.onAction ?? (() => {})}
          />
        </CardZoomProvider>
      </PolishBalanceArtProvider>
    );
  }

  it("the popover shows Basic / Expert (not 'Use'), and clicking Basic plays Intelligence", () => {
    const onAction = vi.fn();
    renderHand(balanceIntelligenceState(), { onAction });
    // Open the Intelligence popover.
    fireEvent.click(screen.getByRole("button", { name: /Intelligence ability card/i }));
    // The reprint's play sides read Basic / Expert, not the generic Use / Use expert.
    const basic = screen.getByRole("button", { name: /^Basic$/ });
    expect(screen.getByRole("button", { name: /^Expert$/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Use$/ })).toBeNull();
    // No standalone "List the spells"/"Open Spell Book" enabler surface on the
    // balance Intelligence card (that path could spend a Cast a Spell card).
    expect(screen.queryByRole("button", { name: /List the spells/i })).toBeNull();

    fireEvent.click(basic);
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "PLAY_CARD", cardId: "ability.intelligence", mode: "basic" })
    );
  });

  it("once played, the free-cast picker lists the Book Spell and arms it WITHOUT a Cast a Spell card", () => {
    const state = balanceIntelligenceState({ played: true });
    // Sanity: the engine offers the free book cast (no enabler) while the
    // one-shot freedom is live, and it is NOT parked in the Ongoing tray.
    expect(state.players.p1.discard).toContain("ability.intelligence");
    expect(state.players.p1.ongoingCards ?? []).toHaveLength(0);
    const freeOffer = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.lightning_bolt" &&
        legal.action.fromSpellBook === true &&
        !legal.action.castEnablerCardId
    );
    expect(freeOffer, "engine offers the enabler-free Intelligence cast").toBeTruthy();

    const onSelectCardAction = vi.fn();
    renderHand(state, { onSelectCardAction });
    // The standalone "cast one Spell free" picker is shown automatically.
    const shortcut = screen.getByRole("button", { name: /Cast Lightning Bolt/i });
    fireEvent.click(shortcut);
    // It arms the FREE cast (fromSpellBook, no Cast a Spell enabler consumed).
    expect(onSelectCardAction).toHaveBeenCalledTimes(1);
    const armed = onSelectCardAction.mock.calls[0]![0] as { fromSpellBook?: boolean; castEnablerCardId?: string };
    expect(armed.fromSpellBook).toBe(true);
    expect(armed.castEnablerCardId, "the free cast spends Intelligence, never a Cast a Spell card").toBeUndefined();
  });

  it("CONTROL: with the balance rule OFF the free-cast picker is not shown", () => {
    const state = balanceIntelligenceState({ played: true });
    // Drop the balance rule; keep the (now classic) Spell Book flow.
    state.adventure!.houseRules = { ...(state.adventure!.houseRules ?? {}), "polish-card-balance": false };
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
    expect(screen.queryByRole("menu", { name: /Cast one Spell free/i })).toBeNull();
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

  it("offers and confirms Tarnum IV's Enchanters purchase from the map hand", () => {
    const state = createAdventureGameState({
      seed: "hand-tarnum-enchanters",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Tarnum", factionId: "conflux", heroDefId: "tarnum_conflux" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    state.activePlayerId = "p1";
    state.pendingChoice = null;
    state.reactionWindow = null;
    state.players.p1.hand = ["specialty.tarnum_conflux.4"];
    state.players.p1.resources.gold = 10;
    const onAction = vi.fn();
    renderHand(state, onAction);

    fireEvent.click(screen.getByRole("button", { name: /Enchanters level IV specialty card/i }));
    fireEvent.click(screen.getByRole("button", { name: /Pay 10 gold.*Enchanters/i }));
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Confirm$/i }));
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "PLAY_CARD",
        cardId: "specialty.tarnum_conflux.4",
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

describe("HandFan — Community Intelligence lets the player CHOOSE the Spell from their discard", () => {
  /**
   * Reported bug: "Randomly selects Spell from Discard Pile, not allowing the
   * user to choose." The ENGINE always offered one CAST_SPELL per Spell in the
   * caster's own discard pile — the hole was here: every enabler-driven cast
   * rendered under the generic label "Pick target", so the buttons for Magic
   * Arrow and Lightning Bolt were indistinguishable and picking one was a coin
   * flip. Each cast now names the Spell it would play.
   */
  function intelligenceHand(community: boolean, discard: string[]): GameState {
    const state = createInitialGameState(`community-intelligence-hand-${community}`);
    // The minimal adventure stub the engine suites use, plus the empty maps
    // `getPlayerView` walks (this component renders a real player view).
    state.adventure = {
      houseRules: { "community-card-balance": community },
      tiles: {},
      fields: {},
      hexEvents: [],
      playerFarTiles: {}
    } as unknown as GameState["adventure"];
    state.players.p1.hand = ["ability.intelligence"];
    state.players.p1.discard = [...discard];
    state.players.p1.limits.expertUses = 0;
    state.players.p2.hand = [];
    state.decks.spells.discardPile = [];
    const griffins = state.combat!.units.unit_p1_griffins;
    griffins.activatedThisRound = false;
    griffins.movedThisActivation = false;
    griffins.attackedThisActivation = false;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
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

  it("names every castable discard Spell on its own button (CONTROL: the printed card offers no discard cast at all)", () => {
    const state = intelligenceHand(true, ["spell.magic_arrow", "spell.lightning_bolt"]);
    // Non-vacuity: the engine really offers both casts on this frame.
    const casts = getLegalActions(state, "p1").filter(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        (legal.action as { fromOwnDiscard?: boolean }).fromOwnDiscard === true
    );
    expect(new Set(casts.map((legal) => (legal.action as { cardId: string }).cardId))).toEqual(
      new Set(["spell.magic_arrow", "spell.lightning_bolt"])
    );

    const { container } = renderHand(state);
    const card = container.querySelector(".fanCard");
    expect(card?.classList.contains("playable")).toBe(true);
    // Two distinct casts, so the card opens its popover rather than arming one.
    fireEvent.click(card!);
    expect(screen.getByRole("button", { name: /^Cast Magic Arrow$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Cast Lightning Bolt$/ })).toBeTruthy();
    // The old generic label is what made the choice invisible.
    expect(screen.queryByRole("button", { name: /^Pick target$/ })).toBeNull();

    cleanup();

    // CONTROL: with the rule OFF, Intelligence is the classic timing-freedom
    // card — no cast is sourced from the discard pile, so no named buttons.
    const printed = intelligenceHand(false, ["spell.magic_arrow", "spell.lightning_bolt"]);
    expect(
      getLegalActions(printed, "p1").filter(
        (legal) =>
          legal.action.type === "CAST_SPELL" &&
          (legal.action as { fromOwnDiscard?: boolean }).fromOwnDiscard === true
      )
    ).toEqual([]);
    renderHand(printed);
    expect(screen.queryByRole("button", { name: /^Cast Magic Arrow$/ })).toBeNull();
  });
});

/**
 * CO-OP (step 6) — the two honest seat tags. Presentation only: both derive
 * from persisted state (`state.controllers` / `state.playerTeams` through the
 * engine's own `isComputerPlayer` / `playersAreAllied`), never from a seat's
 * NAME, and each carries a CONTROL on the identical fixture.
 */
describe("SeatNameplate / OpponentBar — computer seats and co-op allies", () => {
  /** A 3-seat game: p3 computer-controlled, teams stamped as a co-op build does. */
  function coopTable(): GameState {
    const state = createAdventureGameState({
      seed: "coop-seat-tags",
      difficulty: "normal",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Player 1", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "Player 2", factionId: "rampart", heroDefId: "mephala" },
        { id: "p3", name: "Computer 1", factionId: "necropolis", heroDefId: "sandro" }
      ],
      controllers: { p3: { kind: "computer", difficulty: "standard", policyVersion: 1 } },
      gameMode: "coop"
    });
    expect(state.gameMode, "the fixture must really be a co-op build").toBe("coop");
    return state;
  }

  it("tags a COMPUTER-controlled seat — and only that seat", () => {
    const state = coopTable();
    render(<SeatNameplate state={state} playerId="p3" />);
    expect(screen.getByText("Computer")).toBeTruthy();
    cleanup();

    // CONTROL: the identical nameplate for a HUMAN seat of the same game.
    render(<SeatNameplate state={state} playerId="p2" />);
    expect(screen.queryByText("Computer")).toBeNull();
  });

  it("CONTROL: the tag follows the CONTROLLER, not the seat's name", () => {
    const state = coopTable();
    // A human seat NAMED "Computer 1" must NOT be tagged…
    state.players.p2.name = "Computer 1";
    render(<SeatNameplate state={state} playerId="p2" />);
    expect(screen.queryByText("Computer")).toBeNull();
    cleanup();
    // …while the real computer seat renamed to a person's name still is.
    state.players.p3.name = "Alex";
    render(<SeatNameplate state={state} playerId="p3" />);
    expect(screen.getByText("Computer")).toBeTruthy();
  });

  it("marks an allied human 'Ally' in the opponent bar; the computer enemy is not", () => {
    const state = coopTable();
    render(
      <CardZoomProvider>
        <OpponentBar view={getPlayerView(state, "p1")} state={state} viewerPlayerId="p1" />
      </CardZoomProvider>
    );
    const seats = Array.from(document.querySelectorAll(".opponentSeat")) as HTMLElement[];
    expect(seats).toHaveLength(2);
    const [ally, enemy] = seats;
    expect(within(ally).getByText("Ally")).toBeTruthy();
    expect(within(ally).queryByText("Computer")).toBeNull();
    expect(within(enemy).queryByText("Ally")).toBeNull();
    expect(within(enemy).getByText("Computer")).toBeTruthy();
  });

  it("CONTROL: the SAME table in CLASH mode has no Ally tag (the computer tag stays)", () => {
    const state = createAdventureGameState({
      seed: "coop-seat-tags",
      difficulty: "normal",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Player 1", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "Player 2", factionId: "rampart", heroDefId: "mephala" },
        { id: "p3", name: "Computer 1", factionId: "necropolis", heroDefId: "sandro" }
      ],
      controllers: { p3: { kind: "computer", difficulty: "standard", policyVersion: 1 } }
    });
    expect(state.gameMode).toBeUndefined();
    render(
      <CardZoomProvider>
        <OpponentBar view={getPlayerView(state, "p1")} state={state} viewerPlayerId="p1" />
      </CardZoomProvider>
    );
    expect(screen.queryByText("Ally")).toBeNull();
    // The computer tag is NOT a co-op feature — a clash table with AI seats
    // still says who is a bot.
    expect(screen.getByText("Computer")).toBeTruthy();
  });
});

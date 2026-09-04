// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { OpponentInfoDock } from "./opponent-info";
import { CardZoomProvider } from "../table/zoom";
import { createAdventureGameState, redactStateForSeat, type GameState } from "@/engine";
import { coreBuildingDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";

afterEach(cleanup);

/**
 * A 2-player game where p1 is the viewer and p2 the opponent, with p2's PUBLIC
 * state set to distinctive values so the panel can be checked against them.
 */
function twoPlayerGame(): GameState {
  const state = createAdventureGameState({
    seed: "opp-info-ui",
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "Alice", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "Bob", factionId: "necropolis", heroDefId: "sandro" }
    ]
  });
  state.players.p2.resources.gold = 42;
  const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p2");
  if (!town) throw new Error("p2 should control a town");
  town.buildings = ["necropolis.city_hall"];
  const hero = Object.values(state.heroes).find((h) => h.controllerId === "p2" && h.kind === "main");
  if (!hero) throw new Error("p2 should have a main hero");
  hero.level = 3;
  state.players.p2.army = [{ id: "u1", unitDefId: "necropolis.skeletons", side: "few" }];
  return state;
}

/** Render the map-variant dock — the seated map placement in the left rail. */
function renderMapDock(state: GameState) {
  return render(
    <CardZoomProvider>
      <OpponentInfoDock seatIds={["p1", "p2"]} state={state} variant="map" viewerPlayerId="p1" />
    </CardZoomProvider>
  );
}

describe("OpponentInfoDock", () => {
  it("renders the opponent buttons in the left-rail map dock box", () => {
    const { container } = renderMapDock(twoPlayerGame());
    // Map placement: the clear labelled left-rail box…
    const box = container.querySelector(".opponentInfoDock.map");
    expect(box).toBeTruthy();
    // …carrying the per-opponent button…
    expect(within(box as HTMLElement).getByRole("button", { name: /Bob/ })).toBeTruthy();
    // …and NOT the retired HUD-ribbon cell.
    expect(container.querySelector(".advHudCell.opponents")).toBeNull();
  });

  it("shows one button per OPPONENT (not the viewer's own seat)", () => {
    renderMapDock(twoPlayerGame());
    // Bob is an opponent → a button; Alice is the viewer → no button.
    expect(screen.getByRole("button", { name: /Bob/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Alice/ })).toBeNull();
  });

  it("opens a panel with the opponent's resources, buildings, hero level and units", () => {
    renderMapDock(twoPlayerGame());
    fireEvent.click(screen.getByRole("button", { name: /Bob/ }));

    const dialog = screen.getByRole("dialog");
    const panel = within(dialog);

    // Resources (public): p2's 42 gold.
    expect(panel.getByText("42")).toBeTruthy();
    // Hero level (public): level 3.
    expect(panel.getByText(/Hero level 3/i)).toBeTruthy();
    // Buildings (public): the necropolis City Hall by its real name.
    const buildingName = coreBuildingDefinitions["necropolis.city_hall"].name;
    expect(panel.getByText(buildingName)).toBeTruthy();
    // Current units (public): the Skeletons unit by its real name.
    const unitName = coreUnitDefinitions["necropolis.skeletons"].name;
    expect(panel.getAllByText(new RegExp(unitName)).length).toBeGreaterThan(0);
  });

  it("renders nothing (no box, no button) when the viewer has no opponents", () => {
    // Solo / single-live-seat table: no floating box at all — the control
    // proving the dock leaves no empty residue anywhere.
    const { container } = render(
      <CardZoomProvider>
        <OpponentInfoDock seatIds={["p1"]} state={twoPlayerGame()} variant="map" viewerPlayerId="p1" />
      </CardZoomProvider>
    );
    expect(container.querySelector(".opponentInfoDock")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });

  it("keeps the bordered dock box in COMBAT (the card-strip placement is unchanged)", () => {
    const { container } = render(
      <CardZoomProvider>
        <OpponentInfoDock seatIds={["p1", "p2"]} state={twoPlayerGame()} variant="combat" viewerPlayerId="p1" />
      </CardZoomProvider>
    );
    const box = container.querySelector(".opponentInfoDock.combat");
    expect(box).toBeTruthy();
    expect(within(box as HTMLElement).getByRole("button", { name: /Bob/ })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Public card counts + the (public) discard pile.
// ---------------------------------------------------------------------------
describe("OpponentInfoDock — hand/deck/discard counts, crowns and the discard pile", () => {
  function openBob(state: GameState) {
    renderMapDock(state);
    fireEvent.click(screen.getByRole("button", { name: /Bob/ }));
    return within(screen.getByRole("dialog"));
  }

  it("shows level / spell / crown / morale / move status and public pile sizes", () => {
    const state = twoPlayerGame();
    // Public counts: 4 in hand, 9 in the deck, 2 discarded (hidden identities for
    // hand/deck are irrelevant — only the COUNT is public).
    state.players.p2.hand = ["stat.attack", "stat.defense", "stat.power", "stat.knowledge"];
    state.players.p2.deck = new Array(9).fill("stat.attack");
    state.players.p2.discard = ["ability.offense", "spell.magic_arrow"];
    state.players.p2.limits.expertUses = 2;
    state.players.p2.combatStats.expertUsesSpentThisRound = 1;
    state.players.p2.combatStats.spellsCastThisRound = 1;
    state.players.p2.morale = 1;
    const hero = Object.values(state.heroes).find((h) => h.controllerId === "p2" && h.kind === "main")!;
    hero.movementPoints = 3;

    const panel = openBob(state);
    const counts = panel.getByLabelText("Battle status");
    expect(counts.textContent).toMatch(/Hand\s*4/);
    expect(counts.textContent).toMatch(/Deck\s*9/);
    expect(counts.textContent).toMatch(/Discard\s*2/);
    expect(counts.textContent).toMatch(/Level\s*3/);
    expect(counts.textContent).toMatch(/Spell\s*1\/1/);
    // Crowns: 1 of 2 left this combat round.
    expect(counts.textContent).toMatch(/Crowns\s*1\/2/);
    expect(counts.textContent).toMatch(/Morale\s*\+1/);
    expect(counts.textContent).toMatch(/Move\s*3/);
  });

  it("lists the discard pile (public), newest first, and marks the face-up top", () => {
    const state = twoPlayerGame();
    state.players.p2.discard = ["ability.offense", "spell.magic_arrow"];

    const panel = openBob(state);
    const section = panel.getByLabelText("Discard pile");
    const cards = section.querySelectorAll(".opponentDiscardCard");
    expect(cards).toHaveLength(2);
    // Newest first: the face-up TOP (Magic Arrow) leads and carries the cue.
    expect(cards[0].classList.contains("top")).toBe(true);
    expect(cards[0].getAttribute("title")).toMatch(/Magic Arrow/i);
    expect(cards[1].classList.contains("top")).toBe(false);
    expect(cards[1].getAttribute("title")).toMatch(/Offense/i);
  });

  it("CONTROL: an empty discard pile says so instead of rendering cards", () => {
    const state = twoPlayerGame();
    state.players.p2.discard = [];
    const panel = openBob(state);
    const section = panel.getByLabelText("Discard pile");
    expect(section.querySelectorAll(".opponentDiscardCard")).toHaveLength(0);
    expect(section.textContent).toMatch(/empty/i);
  });
});

// ---------------------------------------------------------------------------
// The opponent's SECONDARY hero movement points (public — heroes move openly on
// the map and `redactStateForSeat` never touches `state.heroes`).
// ---------------------------------------------------------------------------
describe("OpponentInfoDock — the opponent's Secondary Hero movement", () => {
  function openBob(state: GameState) {
    renderMapDock(state);
    fireEvent.click(screen.getByRole("button", { name: /Bob/ }));
    return within(screen.getByRole("dialog"));
  }

  /** Give p2 a Secondary Hero standing beside its main one. */
  function hireBobsSecondary(state: GameState, movementPoints: number) {
    const main = Object.values(state.heroes).find((h) => h.controllerId === "p2" && h.kind === "main")!;
    state.heroes.sec_p2 = { ...main, id: "sec_p2", kind: "secondary", movementPoints };
    return state;
  }

  it("shows the Secondary Hero's movement points beside the main hero's", () => {
    const state = twoPlayerGame();
    const main = Object.values(state.heroes).find((h) => h.controllerId === "p2" && h.kind === "main")!;
    main.movementPoints = 3;
    hireBobsSecondary(state, 5);

    const panel = openBob(state);
    const status = panel.getByLabelText("Battle status");
    // Both movement readings are present, each with its own value…
    expect(status.textContent).toMatch(/Move\s*3/);
    expect(status.textContent).toMatch(/2nd move\s*5/);
    // …and the secondary reading really carries the SECONDARY hero's number,
    // not a second copy of the main hero's.
    const secondary = status.querySelector(".opponentSecondaryMove");
    expect(secondary).toBeTruthy();
    expect(secondary?.querySelector(".battleMetricValue")?.textContent).toBe("5");
    expect(secondary?.getAttribute("title")).toMatch(/Secondary Hero/i);
  });

  it("CONTROL: a seat with no Secondary Hero renders no second movement reading", () => {
    const state = twoPlayerGame();
    const main = Object.values(state.heroes).find((h) => h.controllerId === "p2" && h.kind === "main")!;
    main.movementPoints = 3;

    const panel = openBob(state);
    const status = panel.getByLabelText("Battle status");
    expect(status.textContent).toMatch(/Move\s*3/);
    expect(status.textContent).not.toMatch(/2nd move/);
    expect(status.querySelector(".opponentSecondaryMove")).toBeNull();
  });

  it("CONTROL: the VIEWER's own Secondary Hero never leaks into an opponent's panel", () => {
    const state = twoPlayerGame();
    // Alice (the viewer) hires a secondary with a distinctive number; Bob has none.
    const alice = Object.values(state.heroes).find((h) => h.controllerId === "p1" && h.kind === "main")!;
    state.heroes.sec_p1 = { ...alice, id: "sec_p1", kind: "secondary", movementPoints: 7 };

    const panel = openBob(state);
    const status = panel.getByLabelText("Battle status");
    expect(status.textContent).not.toMatch(/2nd move/);
    expect(status.textContent).not.toMatch(/7/);
  });
});

// ---------------------------------------------------------------------------
// The opponent's SPELL BOOK — AMOUNTS ONLY ("how many spells is used/total").
// Which Spells the Book holds stays face down: `redactStateForSeat` replaces an
// opponent's refreshed Book with same-length placeholders (pinned in
// src/engine/ongoing-cards-public-view.test.ts), so only the LENGTH reaches
// this panel. Polish Book: used / total. Classic Book: a cast Spell leaves the
// Book for the discard, so only the stored count exists.
// ---------------------------------------------------------------------------
describe("OpponentInfoDock — the opponent's Spell Book amounts", () => {
  function openBob(state: GameState) {
    renderMapDock(state);
    fireEvent.click(screen.getByRole("button", { name: /Bob/ }));
    return within(screen.getByRole("dialog"));
  }

  function polishBookGame(): GameState {
    const state = twoPlayerGame();
    state.adventure!.houseRules = { ...(state.adventure!.houseRules ?? {}), "polish-spell-book": true };
    return state;
  }

  it("Polish Book: shows USED / TOTAL, never the Spell identities", () => {
    const state = polishBookGame();
    // One refreshed Spell left, two already used → 2 of 3 used.
    state.players.p2.spellBook = ["spell.fortune"];
    state.players.p2.spellBookUsed = ["spell.shield", "spell.weakness"];

    const status = openBob(state).getByLabelText("Battle status");
    expect(status.textContent).toMatch(/Book\s*2\/3/);
  });

  it("moves with the Book: spending another refreshed Spell reads 3/3", () => {
    const state = polishBookGame();
    state.players.p2.spellBook = [];
    state.players.p2.spellBookUsed = ["spell.shield", "spell.weakness", "spell.fortune"];

    const status = openBob(state).getByLabelText("Battle status");
    expect(status.textContent).toMatch(/Book\s*3\/3/);
  });

  it("CONTROL: the classic Book has no USED side — only the stored count shows", () => {
    const state = twoPlayerGame();
    state.players.p2.spellBook = ["spell.fortune", "spell.shield"];
    state.players.p2.spellBookUsed = [];

    const status = openBob(state).getByLabelText("Battle status");
    expect(status.textContent).toMatch(/Book\s*2/);
    expect(status.textContent).not.toMatch(/Book\s*\d+\//);
  });

  it("CONTROL: the refreshed Spells' NAMES never appear in the panel", () => {
    const state = polishBookGame();
    // The frame a hosted client renders: the refreshed side is placeholders.
    state.players.p2.spellBook = ["spell.fortune"];
    state.players.p2.spellBookUsed = [];
    const frame = redactStateForSeat(state, "p1");

    const panel = openBob(frame);
    expect(panel.getByLabelText("Battle status").textContent).toMatch(/Book\s*0\/1/);
    expect(panel.queryByText(/Fortune/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The opponent's IN-PLAY cards (Permanent / Ongoing / Spell Scroll) are face up
// on the table, so the panel lists them read-only.
// ---------------------------------------------------------------------------
describe("OpponentInfoDock — the opponent's cards in play", () => {
  function openBob(state: GameState) {
    renderMapDock(state);
    fireEvent.click(screen.getByRole("button", { name: /Bob/ }));
    return within(screen.getByRole("dialog"));
  }

  it("shows an opponent's ONGOING card face, with no owner control", () => {
    const state = twoPlayerGame();
    state.players.p2.ongoingCards = [{ cardId: "spell.mirth", effectIds: ["fx-1"], returnTo: "discard" }];

    const panel = openBob(redactStateForSeat(state, "p1"));
    const section = panel.getByLabelText("Cards in play");
    expect(section.querySelector(".permanentSlot.ongoing img.permanentCardImage")).toBeTruthy();
    expect(within(section).getByRole("button", { name: /Mirth actions/i })).toBeTruthy();
    fireEvent.click(within(section).getByRole("button", { name: /Mirth actions/i }));
    expect(screen.queryByRole("menuitem", { name: /Discard from play/i })).toBeNull();
  });

  it("CONTROL: a seat with nothing in play says so", () => {
    const panel = openBob(twoPlayerGame());
    const section = panel.getByLabelText("Cards in play");
    expect(section.querySelector(".permanentSlot")).toBeNull();
    expect(section.textContent).toMatch(/No permanent, ongoing, or Spell Scroll cards in play/i);
  });
});

// ---------------------------------------------------------------------------
// Unit Experience — the dossier's army list already carries the ENEMY's rank
// badge + XP bar, and the XP board it opens is READ-ONLY for an opponent (the
// window's action row is gated on an `onAction` the dossier never passes).
// Pure presentation over public fields; pinned here so a later refactor of
// ArmyPanel cannot silently take the enemy's veterancy away.
// ---------------------------------------------------------------------------
describe("OpponentInfoDock — the opponent's unit veterancy", () => {
  /** twoPlayerGame with Unit Experience on and p2's one card part-trained. */
  function trainedGame(): GameState {
    const state = twoPlayerGame();
    state.adventure!.unitExperience = true;
    // necropolis.skeletons is bronze → 5/9/13/17; 6 XP is Seasoned (rank 1).
    state.players.p2.army = [
      { id: "u1", unitDefId: "necropolis.skeletons", side: "few", experience: 6 }
    ];
    return state;
  }

  function openBob(state: GameState) {
    renderMapDock(state);
    fireEvent.click(screen.getByRole("button", { name: /Bob/ }));
    return within(screen.getByRole("dialog"));
  }

  it("shows the enemy card's rank badge and its XP bar in the units section", () => {
    const panel = openBob(redactStateForSeat(trainedGame(), "p1"));
    const units = panel.getByLabelText("Current units");
    expect(units.querySelector(".unitRankBadge.rank-1"), "the enemy's rank badge").toBeTruthy();
    expect(units.querySelector(".armyXpPanel")?.textContent).toMatch(/6\s*\/\s*17 XP/);
  });

  it("the enemy XP board opens READ-ONLY — no Drill / Reinforce / Stack controls", () => {
    const panel = openBob(redactStateForSeat(trainedGame(), "p1"));
    fireEvent.click(within(panel.getByLabelText("Current units")).getByRole("button", {
      name: /Unit Experience Board/i
    }));
    const board = screen.getByLabelText("Unit Experience Board");
    // The per-unit detail is reachable…
    fireEvent.click(
      within(board).getByRole("button", { name: /Open Few Skeletons experience board/i })
    );
    // …and it carries the rank ladder, but not one owner action.
    expect(board.querySelector(".armyUnitActions")).toBeNull();
    expect(within(board).queryByRole("button", { name: /drill/i })).toBeNull();
    expect(within(board).queryByRole("button", { name: /reinforce/i })).toBeNull();
  });

  it("CONTROL: with the rule OFF there is no badge, no XP bar and no board button", () => {
    const state = twoPlayerGame();
    state.players.p2.army = [
      { id: "u1", unitDefId: "necropolis.skeletons", side: "few", experience: 6 }
    ];
    const panel = openBob(redactStateForSeat(state, "p1"));
    const units = panel.getByLabelText("Current units");
    expect(units.querySelector(".unitRankBadge")).toBeNull();
    expect(units.querySelector(".armyXpPanel")).toBeNull();
    expect(within(units).queryByRole("button", { name: /Unit Experience Board/i })).toBeNull();
  });

  it("CONTROL: the enemy's HAND and DECK identities are still absent from the dossier", () => {
    const state = trainedGame();
    state.players.p2.hand = ["spell.fortune"];
    state.players.p2.deck = ["spell.shield"];
    const panel = openBob(redactStateForSeat(state, "p1"));
    // Counts are public; the cards themselves are not.
    expect(panel.queryByText(/Fortune/i)).toBeNull();
    expect(panel.queryByText(/^Shield$/i)).toBeNull();
  });
});

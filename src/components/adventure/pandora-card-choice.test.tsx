// @vitest-environment jsdom
/**
 * Pandora card decisions render the CARD, not its name.
 *
 * Two Pandora prompts were word-only lists — "Put <name> back on top" /
 * "Discard <name>" for the scry (Pandora cards 183-186) and "Keep <name>" for
 * the Polish Pandora Search — even though both are decided by what each card
 * DOES. The tray now shows each card's real face with that card's own engine
 * offers attached, in a row that scrolls sideways (a late-game Search can put
 * four cards up at once).
 *
 * What is pinned here: the DOM contract (the scroll container class + one tile
 * per card, with the right image per card id) and DISPATCH EQUALITY — every
 * button dispatches the very `LegalAction` the engine offered, so the engine is
 * untouched. jsdom cannot compute CSS, so the actual sideways scrolling is a
 * REAL-BROWSER concern; only `.pandoraCardRow` being the container is pinned.
 *
 * Mutation check: deleting the `if (pandoraCardTiles)` branch in PromptTray
 * fails "shows every revealed card's face…", "a spent discard budget…",
 * "shows the kept card…" and "shows the drawn Pandora cards' faces…".
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PromptTray } from "./screen";
import { cardLibrary } from "@/data/cards/library";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  type GameAction,
  type GameState,
  type LegalAction,
  type PlayerId
} from "@/engine";
import { processPendingVisit } from "@/engine/adventure";
import { getPlayerView } from "@/engine/player-view";

afterEach(cleanup);

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

function readyAdventure(seed: string, playerCount = 1): GameState {
  const game = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false, playerCount });
  return game.players.p1.needsHandRefresh || game.players.p1.canMulligan
    ? apply(game, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
    : game;
}

/** A live pandora-scry choice: three Ability cards awaiting keep/discard. */
function scryState(seed: string, playerCount = 1): GameState {
  const state = readyAdventure(seed, playerCount);
  state.players.p1.hand = ["pandora.scry_abilities"];
  const play = getLegalActions(state, "p1").find(
    (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "pandora.scry_abilities"
  );
  expect(play, "the scry card should be playable").toBeTruthy();
  const after = apply(state, play!.action);
  expect(after.pendingChoice?.type === "OPTION_CHOICE" && after.pendingChoice.context).toBe("pandora-scry");
  return after;
}

/** A live Polish Pandora Search: N drawn Pandora cards, keep one. */
function pandoraSearchState(seed: string): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    houseRules: { "polish-pandora-search": true }
  });
  const adventure = state.adventure!;
  const hero = Object.values(state.heroes).find((h) => h.controllerId === "p1" && h.kind === "main")!;
  adventure.pendingVisit = {
    playerId: "p1",
    heroId: hero.id,
    fieldId: Object.keys(adventure.fields)[0]!,
    steps: [{ type: "DRAW_PANDORA_CARD" }]
  };
  processPendingVisit(state);
  const step = adventure.pendingVisit?.steps[0];
  expect(step?.type, "the Search opens a keep-one CHOOSE_ONE").toBe("CHOOSE_ONE");
  return state;
}

function tray(state: GameState, viewerPlayerId: PlayerId, onAction = vi.fn()) {
  const rendered = render(
    <PromptTray
      legalActions={getLegalActions(state, viewerPlayerId)}
      onAction={onAction}
      state={state}
      viewerPlayerId={viewerPlayerId}
    />
  );
  return { ...rendered, onAction };
}

function chooseOptionAction(state: GameState, optionIndex: number): GameAction {
  const choice = state.pendingChoice!;
  const legal = getLegalActions(state, "p1").find(
    (entry): entry is LegalAction & { action: Extract<GameAction, { type: "CHOOSE_OPTION" }> } =>
      entry.action.type === "CHOOSE_OPTION" &&
      entry.action.choiceId === choice.id &&
      entry.action.optionIndex === optionIndex
  );
  expect(legal, `the engine offers option ${optionIndex}`).toBeTruthy();
  return legal!.action;
}

describe("Pandora scry — card faces with per-card keep / discard buttons", () => {
  it("shows every revealed card's face and dispatches the engine's own offers", () => {
    const state = scryState("pandora-scry-ui");
    const choice = state.pendingChoice!;
    if (choice.type !== "OPTION_CHOICE" || !choice.pandoraScry) throw new Error("no scry");
    const revealed = choice.pandoraScry.remaining;
    expect(revealed.length).toBe(3);

    const { container, onAction } = tray(state, "p1");

    // The scroll container + one tile per revealed card (the CSS itself is a
    // real-browser concern — jsdom cannot compute overflow).
    const row = container.querySelector(".promptOptions.pandoraCardRow");
    expect(row, "the card row is the scroll container").toBeTruthy();
    const tiles = container.querySelectorAll(".pandoraCardTile");
    expect(tiles).toHaveLength(revealed.length);

    // Each tile shows THAT card's face (never a generic/placeholder image).
    revealed.forEach((cardId, index) => {
      const image = cardLibrary[cardId]?.assets?.cardImage;
      expect(image, `${cardId} has card art`).toBeTruthy();
      expect(tiles[index]!.querySelector("img")?.getAttribute("src")).toContain(image!);
      expect(tiles[index]!.textContent).toContain(cardLibrary[cardId]!.name);
    });

    // Dispatch equality: each button carries the ENGINE label as its accessible
    // name and dispatches the very action the engine offered. The engine's option
    // order is [keep r0…rN] then [discard r0…rN].
    const keepName = (cardId: string) => `Put ${cardLibrary[cardId]!.name} back on top`;
    fireEvent.click(screen.getByRole("button", { name: keepName(revealed[1]!) }));
    expect(onAction).toHaveBeenLastCalledWith(chooseOptionAction(state, 1));

    const discardName = (cardId: string) => `Discard ${cardLibrary[cardId]!.name}`;
    fireEvent.click(screen.getByRole("button", { name: discardName(revealed[0]!) }));
    expect(onAction).toHaveBeenLastCalledWith(chooseOptionAction(state, revealed.length + 0));
    // …and that is a CHOOSE_OPTION on this choice, nothing invented.
    expect(onAction).toHaveBeenLastCalledWith({
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: revealed.length
    });
  });

  it("a spent discard budget leaves only the keep button (offers are read, not assumed)", () => {
    let state = scryState("pandora-scry-spent");
    const first = state.pendingChoice!;
    if (first.type !== "OPTION_CHOICE" || !first.pandoraScry) throw new Error("no scry");
    // Discard two of the three revealed cards — the printed "up to 2".
    state = apply(state, chooseOptionAction(state, first.pandoraScry.remaining.length));
    const second = state.pendingChoice!;
    if (second.type !== "OPTION_CHOICE" || !second.pandoraScry) throw new Error("no scry");
    state = apply(state, chooseOptionAction(state, second.pandoraScry.remaining.length));

    const last = state.pendingChoice!;
    if (last.type !== "OPTION_CHOICE" || !last.pandoraScry) throw new Error("no scry");
    expect(last.pandoraScry.discardsRemaining).toBe(0);
    const lastCardId = last.pandoraScry.remaining[0]!;

    const { container } = tray(state, "p1");
    expect(container.querySelectorAll(".pandoraCardTile")).toHaveLength(1);
    // One tile, ONE action button: the engine no longer offers a discard.
    expect(container.querySelectorAll(".pandoraCardActions .commandButton")).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: `Put ${cardLibrary[lastCardId]!.name} back on top` })
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Discard / })).toBeNull();
  });

  it("shows the kept card going back on top once one is picked", () => {
    let state = scryState("pandora-scry-kept");
    const first = state.pendingChoice!;
    if (first.type !== "OPTION_CHOICE" || !first.pandoraScry) throw new Error("no scry");
    const keptId = first.pandoraScry.remaining[0]!;
    state = apply(state, chooseOptionAction(state, 0)); // keep r0

    const { container } = tray(state, "p1");
    const strip = container.querySelector('[data-testid="pandora-kept-strip"]');
    expect(strip, "the kept cards show as a small strip").toBeTruthy();
    expect(strip!.querySelector("img")?.getAttribute("src")).toContain(
      cardLibrary[keptId]!.assets!.cardImage!
    );
    // Two cards are still on the table.
    expect(container.querySelectorAll(".pandoraCardTile")).toHaveLength(2);
  });

  it("HIDDEN INFO: another seat's view carries no identities and renders no card faces", () => {
    const state = scryState("pandora-scry-mask", 2);
    const oppView = getPlayerView(state, "p2");
    const masked = oppView.pendingChoice;
    // The engine already masks the revealed ids (player-view.ts) — re-pinned here
    // because the UI must only ever render what the viewer's own state exposes.
    expect(masked?.type === "OPTION_CHOICE" && masked.pandoraScry!.remaining.every((id) => id === "hidden")).toBe(
      true
    );

    // Cast like every other view-driven component test (obelisk-grail-clue-art):
    // the client really does render a redacted, GameState-shaped frame.
    const { container } = tray(oppView as unknown as GameState, "p2");
    expect(container.querySelector(".pandoraCardRow")).toBeNull();
    expect(container.querySelectorAll("img")).toHaveLength(0);
    // p2 gets the quiet "is deciding…" strip instead.
    expect(container.querySelector(".reactionStrip.waiting")).toBeTruthy();
  });
});

describe("Polish Pandora Search — pick by the Pandora card's face", () => {
  it("shows the drawn Pandora cards' faces and dispatches the engine's own offers", () => {
    const state = pandoraSearchState("polish-pandora-ui");
    const step = state.adventure!.pendingVisit!.steps[0];
    if (step.type !== "CHOOSE_ONE") throw new Error("no CHOOSE_ONE");
    expect(step.options.length).toBeGreaterThanOrEqual(2);
    // The drawn Pandora cards, in the engine's own option order.
    const drawnIds = step.options.map((option) => {
      const inner = option.steps.find((entry) => entry.type === "RESOLVE_PANDORA_SEARCH");
      if (inner?.type !== "RESOLVE_PANDORA_SEARCH") throw new Error("no resolve step");
      return inner.drawn[inner.keepIndexes[0]!]!;
    });

    const { container, onAction } = tray(state, "p1");
    const tiles = container.querySelectorAll(".pandoraCardTile");
    expect(container.querySelector(".promptOptions.pandoraCardRow")).toBeTruthy();
    expect(tiles).toHaveLength(drawnIds.length);
    drawnIds.forEach((cardId, index) => {
      const image = cardLibrary[cardId]?.assets?.cardImage;
      expect(image, `${cardId} has Pandora card art`).toBeTruthy();
      expect(tiles[index]!.querySelector("img")?.getAttribute("src")).toContain(image!);
      expect(tiles[index]!.textContent).toContain(cardLibrary[cardId]!.name);
    });

    // Dispatch equality against the engine's own RESOLVE_VISIT_STEP offer.
    const engineOffer = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "RESOLVE_VISIT_STEP" && legal.action.optionIndex === 1
    );
    expect(engineOffer).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: `Keep ${cardLibrary[drawnIds[1]!]!.name}` }));
    expect(onAction).toHaveBeenLastCalledWith(engineOffer!.action);
  });
});

describe("CONTROL — unrelated prompts keep the generic path", () => {
  it("a plain visit CHOOSE_ONE renders text options, never the Pandora card row", () => {
    const state = readyAdventure("pandora-control");
    const adventure = state.adventure!;
    const hero = Object.values(state.heroes).find((h) => h.controllerId === "p1" && h.kind === "main")!;
    adventure.pendingVisit = {
      playerId: "p1",
      heroId: hero.id,
      fieldId: Object.keys(adventure.fields)[0]!,
      steps: [
        {
          type: "CHOOSE_ONE",
          prompt: "Pick a bonus",
          options: [
            { label: "Gain 3 gold", steps: [{ type: "GAIN_RESOURCES", gold: 3 }] },
            { label: "Gain 1 movement", steps: [{ type: "GAIN_MOVEMENT", amount: 1 }] }
          ]
        }
      ]
    };

    const { container } = tray(state, "p1");
    expect(container.querySelector(".pandoraCardRow")).toBeNull();
    expect(container.querySelector(".pandoraCardTile")).toBeNull();
    expect(screen.getByRole("button", { name: /Gain 1 movement/ })).toBeTruthy();
  });
});

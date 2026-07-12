// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AdventureDecksPanel, AdventureOwnDeck } from "./screen";
import { createAdventureGameState, getPlayerView } from "@/engine";
import { cardLibrary } from "@/data/cards/library";

afterEach(cleanup);

/**
 * Discard trays must show the actual face-up top card graphic (spells,
 * artifacts, abilities, own discard) — not a bare count. A bare count is the
 * bug the player reported as "discard tray … must show actual graphic card".
 */
describe("Adventure discard trays show the top card graphic", () => {
  it("shows the shared Spell discard top card art (control: empty pile stays a count)", () => {
    const state = createAdventureGameState({ seed: "discard-art", difficulty: "normal", rollFirstPlayer: false });
    // Seed a known face-up top on the Spell discard (same convention as setup).
    const spellId =
      Object.keys(cardLibrary).find((id) => id.startsWith("spell.") && cardLibrary[id]?.assets?.cardImage) ??
      "spell.magic_arrow";
    state.decks.spells.discardPile = [spellId];
    const view = getPlayerView(state, "p1");
    render(
      <AdventureDecksPanel
        view={view}
        viewerPlayerId="p1"
        onShowPile={vi.fn()}
      />
    );
    const spellName = cardLibrary[spellId]?.name ?? spellId;
    // The top card art is the accessible name of the discard-top image.
    expect(screen.getByRole("img", { name: spellName })).toBeTruthy();
  });

  it("shows the player's own discard top card art", () => {
    const state = createAdventureGameState({ seed: "own-discard-art", difficulty: "normal", rollFirstPlayer: false });
    const cardId =
      Object.keys(cardLibrary).find((id) => cardLibrary[id]?.assets?.cardImage) ?? state.players.p1.hand[0];
    state.players.p1.discard = [cardId];
    const view = getPlayerView(state, "p1");
    render(<AdventureOwnDeck view={view} viewerPlayerId="p1" onShowPile={vi.fn()} />);
    const name = cardLibrary[cardId]?.name ?? cardId;
    expect(screen.getByRole("img", { name: name })).toBeTruthy();
    // Count badge still present so pile size is clear.
    expect(screen.getByText("1")).toBeTruthy();
  });
});

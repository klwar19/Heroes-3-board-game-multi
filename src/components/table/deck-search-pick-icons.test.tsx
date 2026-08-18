// @vitest-environment jsdom
/**
 * A deck SEARCH / dig that lets the player pick which revealed card to GET must
 * SHOW EACH GETTABLE CARD'S FACE ICON — not a text-only button (author report:
 * "SHOW THE ICON OF CARDS THAT U CAN GET, THEY ARE ALL IN ASSETS").
 *
 * Two surfaces share ONE component (`PromptTray`), pinned here:
 *   - EAGLE_EYE_DIG (a Tome of X / Eagle Eye): reveal ONE spell, take-or-discard.
 *     `pendingChoice.context === "eagle-eye"`, carrying `eagleEye.cardId`.
 *   - DECK_DIG_KEEP_ONE (Pendant of Second Sight's "Search (3) your M&M deck"):
 *     reveal N own-deck cards, keep one. `context === "own-deck-pick"`, carrying
 *     `ownDeckPick.cardIds`.
 *
 * Both render through the tray's reward-art path (the same `CardSetFrame` +
 * `resolveCardFaceImage` used by discard-pick / hand-discard), so each offered
 * option button carries an <img> whose src is that card's face asset. jsdom
 * cannot compute CSS, so only the DOM contract (the face <img> per option) is
 * pinned. The Eagle-Eye state is built by really playing the Tome; the
 * own-deck-pick state feeds the engine a real `own-deck-pick` choice and renders
 * the engine's OWN index-aligned offers.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PromptTray } from "@/components/adventure/screen";
import { applyAction, createAdventureGameState, getLegalActions, type GameState } from "@/engine";
import type { CardId, GameAction } from "@/engine/state";

afterEach(cleanup);

const TOME_EARTH = "artifact.tome_of_earth" as CardId;
const STONE_SKIN = "spell.stone_skin" as CardId; // an Earth spell with a face scan

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** Play the Tome's dig on a single-deck table ⇒ the take-or-discard prompt is open. */
function openedEagleEyeDig(seed: string): GameState {
  let state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  state.activePlayerId = "p1";
  state.players.p1.hand = [TOME_EARTH];
  state.decks.spells.drawPile = [STONE_SKIN];
  state.decks.spells.discardPile = [];

  const play = getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" && legal.action.cardId === TOME_EARTH && legal.action.optionIndex === 0
  );
  expect(play, "the Tome's dig side is offered").toBeTruthy();
  const opened = applyOk(state, play!.action);
  expect(opened.pendingChoice?.type === "OPTION_CHOICE" ? opened.pendingChoice.context : null).toBe("eagle-eye");
  expect(opened.pendingChoice?.type === "OPTION_CHOICE" ? opened.pendingChoice.eagleEye?.cardId : null).toBe(
    STONE_SKIN
  );
  return opened;
}

describe("deck search / dig pick — each gettable card shows its face icon", () => {
  it("EAGLE_EYE_DIG (Tome): the take AND discard buttons both show the found spell's face", () => {
    const state = openedEagleEyeDig("eagle-eye-icons");
    const legalActions = getLegalActions(state, "p1");
    render(<PromptTray legalActions={legalActions} onAction={vi.fn()} state={state} viewerPlayerId="p1" />);

    const takeButton = screen.getByRole("button", { name: /Take Stone Skin/i });
    const discardButton = screen.getByRole("button", { name: /Discard Stone Skin/i });
    for (const button of [takeButton, discardButton]) {
      const img = button.querySelector("img");
      expect(img, "the offered card renders a face <img>").not.toBeNull();
      expect(img!.getAttribute("src") ?? "").toContain("spells-stone_skin");
    }
  });

  it("DECK_DIG_KEEP_ONE (Pendant): every 'Keep' option shows its own-deck card face", () => {
    const state = createAdventureGameState({ seed: "own-deck-pick-icons", difficulty: "normal", rollFirstPlayer: false });
    state.activePlayerId = "p1";
    state.priorityPlayerId = "p1";
    state.phase = "choice";
    const revealed = [STONE_SKIN, "spell.bloodlust" as CardId, "stat.attack" as CardId];
    state.pendingChoice = {
      id: "choice_own_deck_pick_test",
      type: "OPTION_CHOICE",
      playerId: "p1",
      prompt: "Pendant of Second Sight: keep one card; the rest go to your discard pile.",
      options: [{ label: "Keep Stone Skin" }, { label: "Keep Bloodlust" }, { label: "Keep Attack" }],
      context: "own-deck-pick",
      ownDeckPick: { cardIds: revealed },
      returnPhase: "player-turn"
    };

    const legalActions = getLegalActions(state, "p1");
    expect(legalActions.filter((legal) => legal.action.type === "CHOOSE_OPTION")).toHaveLength(3);
    render(<PromptTray legalActions={legalActions} onAction={vi.fn()} state={state} viewerPlayerId="p1" />);

    const faces: Record<string, string> = {
      "Keep Stone Skin": "spells-stone_skin",
      "Keep Bloodlust": "spells-bloodlust",
      "Keep Attack": "statistics-attack"
    };
    for (const [name, faceFragment] of Object.entries(faces)) {
      const button = screen.getByRole("button", { name: new RegExp(name, "i") });
      const img = button.querySelector("img");
      expect(img, `${name} renders a face <img>`).not.toBeNull();
      expect(img!.getAttribute("src") ?? "", `${name} shows ${faceFragment}`).toContain(faceFragment);
    }
  });
});
